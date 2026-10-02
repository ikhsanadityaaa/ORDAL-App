import asyncio
import os
import random
from urllib.parse import quote_plus, urljoin

from playwright.async_api import async_playwright

from routers.credentials import cookies_path
from workers.browser_launcher import launch_browser
from workers.file_utils import prepare_upload_file
from workers.match_utils import matches_position, parse_positions


class SimplePlatformBot:
    platform = ""
    home_url = ""
    search_url = ""
    card_selectors = ()
    apply_words = ()
    success_words = ()

    def __init__(self, user_id, on_apply, emit, ask_user_question=None, should_stop=None, before_apply=None):
        self.user_id = user_id
        self.on_apply = on_apply
        self.emit = emit
        self.ask_user_question = ask_user_question
        self.should_stop = should_stop or (lambda: False)
        self.before_apply = before_apply
        self._browser = None

    async def run(self, targets):
        state_path = cookies_path(str(self.user_id), self.platform)
        if not os.path.exists(state_path):
            self.emit({"type": "cookie_expired", "platform": self.platform,
                       "message": f"Login {self.platform.title()} dulu di Persiapan."})
            return

        async with async_playwright() as p:
            self._browser = await launch_browser(p, headless=False, prefer_system_chrome=True)
            context = await self._browser.new_context(storage_state=state_path)
            page = await context.new_page()
            try:
                await page.goto(self.home_url, timeout=60000, wait_until="domcontentloaded")
                if await self._looks_logged_out(page):
                    self.emit({"type": "cookie_expired", "platform": self.platform,
                               "message": f"Session {self.platform.title()} berakhir. Login ulang di Persiapan."})
                    return
                for target in targets:
                    if self.should_stop():
                        raise asyncio.CancelledError()
                    await self._search_target(context, page, target)
            finally:
                await context.storage_state(path=state_path)
                await self._browser.close()

    async def _search_target(self, context, page, target):
        positions = parse_positions(target.get("position") or "") or [target.get("position") or ""]
        for position in positions:
            url = self.search_url.format(position=quote_plus(position), location=quote_plus(target.get("location") or ""))
            self.emit({"type": "status", "platform": self.platform,
                       "message": f"Mencari {position} di {target.get('location') or 'semua lokasi'}"})
            await page.goto(url, timeout=60000, wait_until="domcontentloaded")
            await page.wait_for_timeout(2500)
            cards = await self._cards(page)
            for card in cards[:25]:
                if self.should_stop():
                    raise asyncio.CancelledError()
                title, company, location, job_url = await self._card_data(card, page.url)
                if not job_url or not matches_position(title, position):
                    continue
                if await self._already_applied(job_url, title, company):
                    continue
                detail = await context.new_page()
                try:
                    await detail.goto(job_url, timeout=60000, wait_until="domcontentloaded")
                    if self.before_apply and not await self.before_apply(
                        self.platform, target, title, company, job_url, location,
                        await detail.locator("body").inner_text(),
                    ):
                        await self.on_apply(
                            self.platform, title, company, job_url, target.get("position") or position,
                            target.get("location") or "", "found", "Masuk Antrean Lamaran", location,
                        )
                        continue
                    applied, reason = await self._apply(detail, target, title, company)
                    await self.on_apply(
                        self.platform, title, company, job_url, target.get("position") or position,
                        target.get("location") or "", "applied" if applied else "skipped",
                        None if applied else reason, location,
                    )
                    if applied:
                        return
                finally:
                    await detail.close()

    async def _cards(self, page):
        for selector in self.card_selectors:
            cards = await page.query_selector_all(selector)
            if cards:
                return cards
        return []

    async def _card_data(self, card, base_url):
        raw_text = await card.inner_text()
        text = " ".join(raw_text.split())
        link_selector = "a[href*='/viewjob'], a[href*='/opportunities/jobs/'], a[href]"
        link = await card.query_selector(link_selector)
        href = await link.get_attribute("href") if link else ""
        title = ""
        company = ""
        location = ""
        for selector in ("h2", "h3", "[data-testid*='title']", "[class*='title' i]"):
            el = await card.query_selector(selector)
            if el:
                title = " ".join((await el.inner_text()).split())
                if title:
                    break
        lines = [" ".join(line.split()) for line in raw_text.splitlines() if line.strip()]
        title = title or (lines[0] if lines else "Lowongan")
        if len(lines) > 1:
            company = lines[1]
        if len(lines) > 2:
            location = lines[2]
        return title[:180], company[:180], location[:180], urljoin(base_url, href or "")

    async def _apply(self, page, target, title, company):
        button = await self._button(page, self.apply_words)
        if not button:
            return False, "Lamaran cepat tidak tersedia"
        await button.click()
        await page.wait_for_timeout(1800)

        for _ in range(8):
            if await self._confirmed(page):
                return True, ""
            await self._fill_visible_fields(page, target, title)
            final = await self._button(page, ("submit application", "kirim lamaran", "apply now", "lamar sekarang"))
            if final:
                await final.click()
                await page.wait_for_timeout(2500)
                if await self._confirmed(page):
                    return True, ""
            nxt = await self._button(page, ("continue", "next", "review", "lanjut", "berikutnya", "tinjau"))
            if not nxt:
                break
            await nxt.click()
            await page.wait_for_timeout(1200)
        return False, "Form lamaran memerlukan pemeriksaan manual"

    async def _fill_visible_fields(self, page, target, title):
        cv_path = target.get("file_path") or ""
        for upload in await page.query_selector_all("input[type='file']"):
            if cv_path:
                prepared = prepare_upload_file(cv_path)
                await upload.set_input_files(prepared)

        for field in await page.query_selector_all("input:not([type]), input[type='text'], input[type='tel'], input[type='number'], textarea"):
            if not await field.is_visible() or await field.input_value():
                continue
            label = await self._label(page, field)
            answer = ""
            if self.ask_user_question:
                field_type = (await field.get_attribute("type")) or ("textarea" if await field.evaluate("e => e.tagName === 'TEXTAREA'") else "text")
                answer = await self.ask_user_question(self.platform, label, field_type, title, options=[])
            if answer:
                await field.fill(str(answer))

        for select in await page.query_selector_all("select"):
            if not await select.is_visible():
                continue
            options = await select.locator("option").all_text_contents()
            label = await self._label(page, select)
            answer = await self.ask_user_question(self.platform, label, "select", title, options=options) if self.ask_user_question else ""
            if answer:
                await select.select_option(label=answer)

        for checkbox in await page.query_selector_all("input[type='checkbox'][required]"):
            if await checkbox.is_visible() and not await checkbox.is_checked():
                await checkbox.check()

    async def _label(self, page, field):
        field_id = await field.get_attribute("id")
        if field_id:
            label = await page.query_selector(f'label[for="{field_id}"]')
            if label:
                return " ".join((await label.inner_text()).split())
        return (await field.get_attribute("aria-label")) or (await field.get_attribute("placeholder")) or "Pertanyaan lamaran"

    async def _button(self, page, words):
        for element in await page.query_selector_all("button, a[role='button'], input[type='submit']"):
            try:
                if not await element.is_visible() or await element.is_disabled():
                    continue
                text = " ".join(((await element.inner_text()) or (await element.get_attribute("value")) or "").lower().split())
                if any(word in text for word in words):
                    return element
            except Exception:
                continue
        return None

    async def _confirmed(self, page):
        body = " ".join((await page.locator("body").inner_text()).lower().split())
        return any(word in body for word in self.success_words)

    async def _looks_logged_out(self, page):
        url = page.url.lower()
        return "/login" in url or "/auth" in url or "/signin" in url

    async def _already_applied(self, job_url, title, company):
        try:
            from database import get_db
            db = get_db()
            row = db.execute(
                "SELECT 1 FROM apply_logs WHERE status='applied' AND (job_url=? OR (lower(job_title)=? AND lower(company)=?)) LIMIT 1",
                (job_url, title.lower(), company.lower()),
            ).fetchone()
            db.close()
            return bool(row)
        except Exception:
            return False

    async def _delay(self):
        await asyncio.sleep(random.uniform(0.8, 1.5))
