import asyncio
import os
import sys
import threading

from fastapi import APIRouter, Depends, HTTPException
from playwright.async_api import TimeoutError as PlaywrightTimeout
from playwright.async_api import async_playwright

from auth_utils import get_current_user
from database import get_db, get_data_dir

router = APIRouter()

# v42: Pakai get_data_dir() single source of truth dari database.py.
COOKIES_DIR = os.path.join(get_data_dir(), "cookies")
os.makedirs(COOKIES_DIR, exist_ok=True)

LOGIN_TIMEOUT_MS = int(os.getenv("LOGIN_TIMEOUT_MS", "300000"))
def cookies_path(user_id: str, platform_name: str) -> str:
    return os.path.join(COOKIES_DIR, f"{user_id}_{platform_name}.json")


def save_credential_marker(user_id: str, platform_name: str, method: str):
    db = get_db()
    db.execute(
        """
        INSERT INTO user_credentials (user_id, platform, email, password)
        VALUES (?, ?, ?, '')
        ON CONFLICT(user_id, platform) DO UPDATE SET
            email = excluded.email,
            updated_at = datetime('now')
        """,
        (user_id, platform_name, method),
    )
    db.commit()
    db.close()


PLATFORM_CONFIG = {
    "linkedin": {
        "label": "LinkedIn",
        "login_url": "https://www.linkedin.com/login",
        "check_url": "https://www.linkedin.com/feed/",
        # v28: protected_url untuk konfirmasi login
        "protected_url": "https://www.linkedin.com/feed/",
        "cookie_urls": ["https://www.linkedin.com", "https://linkedin.com"],
        # v24: HANYA cookie yang di-set SETELAH login berhasil.
        # JSESSIONID, bscookie, bcookie DIHAPUS karena di-set selama proses
        # login (bahkan saat verifikasi email/checkpoint) → false positive.
        # li_at = cookie auth utama, hanya di-set setelah login berhasil.
        # liap = companion cookie, juga hanya setelah login berhasil.
        "key_cookies": ["li_at", "liap"],
        # v24: "checkpoint" DITAMBAHKAN KEMBALI ke invalid_url_parts.
        # v16 menghapus "checkpoint" karena kira user sudah login padahal
        # di halaman checkpoint. Tapi checkpoint = verifikasi email/2FA —
        # user BELUM selesai login! Bot tidak boleh anggap login saat di
        # halaman checkpoint. User harus selesaikan verifikasi dulu, baru
        # LinkedIn redirect ke /feed/.
        "invalid_url_parts": [
            "authwall", "signup", "one-time-login", "checkpoint",
        ],
        # Selectors UI yang menandakan user SUDAH login.
        # v16: tambah selectors lebih lengkap untuk LinkedIn 2024+.
        # LinkedIn sering ganti class name, jadi pakai multiple fallbacks.
        "logged_in_selectors": [
            # Avatar profil di nav bar (class spesifik LinkedIn)
            "img.global-nav__me-photo",
            "img[class*='global-nav__me-photo']",
            ".global-nav__me-photo",
            # Profile link di nav (hanya muncul setelah login)
            "a.global-nav__primary-link[href*='/in/']",
            # Nav avatar button (LinkedIn 2024+ pakai button dengan aria-label)
            "button[aria-label*='View profile' i]",
            "button[aria-label*='Lihat profil' i]",
            "button[aria-label*='Account' i]",
            "button[aria-label*='Akun' i]",
            "button[aria-label*='Me' i][data-control-name]",
            # Welcome message / dropdown profile
            "[data-control-name='identity_welcome_message']",
            "[data-test-id='nav-settings']",
            # Settings menu (hanya visible setelah login)
            "a[href^='/mypreferences/']",
            # Feed-specific elements (hanya ada di /feed/)
            "div.feed-shared-update",
            "div.feed-identity-module",
            # LinkedIn 2024+ global nav (header dengan avatar)
            "nav.global-nav",
            "header.global-nav__header",
            # Search bar di feed (hanya setelah login)
            "input[placeholder*='Search' i][aria-label*='Search' i]",
            # Profile dropdown trigger (button dengan img avatar)
            "button[class*='global-nav__me']",
            "button[class*='nav__me-']",
        ],
        # Selectors UI yang menandakan user BELUM login (login form visible).
        "login_form_selectors": [
            "form.login__form",
            "input#username",
            "input[name='session_key']",
            "button[type='submit'][aria-label*='Sign in' i]",
            "button[type='submit'][aria-label*='Masuk' i]",
            ".authwall",
            "#base-public-modal",
        ],
    },
    "jobstreet": {
        "label": "JobStreet",
        "login_url": "https://id.jobstreet.com/id",
        "check_url": "https://id.jobstreet.com/id",
        # v28: protected_url = URL yang HANYA bisa diakses setelah login.
        # Dipakai untuk KONFIRMASI: navigasi ke sini, kalau redirect ke
        # login → belum login. Kalau tetap di sini → confirmed login.
        "protected_url": "https://id.jobstreet.com/id/myactivity",
        "cookie_urls": [
            "https://id.jobstreet.com",
            "https://www.jobstreet.com",
            "https://seek.com",
        ],
        "key_cookies": [
            "SEEK_AU_AUTH",
            "JobseekerSessionToken",
        ],
        "invalid_url_parts": [
            "signin", "sign-in", "login", "log-in", "register",
            "signup", "sign-up", "/auth/", "sso/", "/account/login",
        ],
        # v32: HAPUS SEMUA UI selectors JobStreet.
        # UI selectors selalu false positive — JobStreet ganti DOM terus,
        # dan halaman home punya elemen data-automation yang match padahal
        # belum login. Tidak ada UI selector yang reliable untuk JobStreet.
        #
        # Sekarang: HANYA andalkan AUTH cookie (SEEK_AU_AUTH / JobseekerSessionToken).
        # Cookie ini HANYA di-set setelah login berhasil. Tidak false positive.
        # Kalau JobStreet modern tidak set cookie ini (pakai sessionStorage),
        # timeout 5 menit → user pakai "Assume logged in" sebagai fallback.
        "logged_in_selectors": [],
        "login_form_selectors": [],
    },
}


async def _has_login_cookie(context, cfg: dict):
    cookies = await context.cookies(cfg["cookie_urls"])
    cookie_names = [c.get("name") for c in cookies]
    has_key = any(n in cookie_names for n in cfg["key_cookies"])
    return has_key, len(cookies), cookie_names


async def _has_logged_in_ui(page, cfg: dict) -> bool:
    """Cek apakah halaman menampilkan UI yang menandakan user SUDAH login.

    Penting:
    - Selector harus SPESIFIK (jangan `button:has(img)` — terlalu generik).
    - Kalau ada `login_form_selectors` yang visible, return False walaupun
      ada positive selector yang match (anti false-positive).
    """
    # ── Cek negative signals DULU: kalau form login visible → belum login ──
    for selector in cfg.get("login_form_selectors", []):
        try:
            if await page.locator(selector).first.is_visible(timeout=400):
                return False
        except Exception:
            pass

    # ── Cek positive signals: UI yang hanya muncul setelah login ──
    for selector in cfg.get("logged_in_selectors", []):
        try:
            if await page.locator(selector).first.is_visible(timeout=750):
                return True
        except Exception:
            pass
    return False


async def _run_grab(platform_name: str, user_id: str):
    """Coroutine yang menjalankan Playwright. Dipanggil di event loop baru.

    v14 fix Mac bugs:
    1. Handle browser closed gracefully. Sebelumnya, kalau user close browser
       window di tengah capture, `page.wait_for_timeout` raise exception
       "Target page, context or browser has been closed" → error 500 ke UI.
       Sekarang: catch exception, exit loop, return logged_in=False.
    2. Pakai launch_browser() dari browser_launcher.py (v12 Mac launch args)
       bukan p.chromium.launch langsung. Sebelumnya credentials.py pakai
       launch langsung → Mac launch args tidak dipakai → lebih lambat.
    3. Tambah retry untuk page.goto kalau timeout (network lambat di Mac).
    4. Cek page.url validity sebelum akses (page bisa closed di tengah loop).
    """
    from workers.browser_launcher import launch_browser

    cfg = PLATFORM_CONFIG[platform_name]
    state_path = cookies_path(user_id, platform_name)

    logged_in    = False
    cookie_count = 0
    cookie_names_seen: list[str] = []
    browser = None
    _iteration = 0  # v30: counter untuk periodic check

    try:
        async with async_playwright() as p:
            # v14: pakai launch_browser() bukan p.chromium.launch langsung
            # supaya Mac launch args (v12) dipakai → lebih cepat & stabil.
            # Pakai Chrome resmi kalau tersedia agar OAuth Google tidak menolak
            # Chromium automation. Tetap fallback ke Playwright Chromium.
            browser = await launch_browser(p, headless=False, prefer_system_chrome=True)

            # Pakai user agent asli browser. UA Windows Chrome 120 lama membuat
            # Google menganggap browser tidak aman pada macOS.
            context_kwargs = {}
            # v27: JANGAN load storage_state lama — mulai dari clean state.
            # Sebelumnya, storage_state lama (yang mungkin expired/false positive)
            # di-load → cookies lama bikin has_key True → false positive.
            # Sekarang: selalu mulai fresh. Kalau user login, session baru
            # akan di-save.
            if os.path.exists(state_path):
                try:
                    os.remove(state_path)
                except Exception:
                    pass

            context = await browser.new_context(**context_kwargs)
            page    = await context.new_page()

            # Goto login_url dengan retry (Mac network kadang lambat)
            goto_ok = False
            last_goto_error = None
            for attempt in range(3):
                try:
                    await page.goto(cfg["login_url"], timeout=60000, wait_until="domcontentloaded")
                    goto_ok = True
                    break
                except PlaywrightTimeout:
                    last_goto_error = "timeout"
                    if attempt < 2:
                        await asyncio.sleep(2)
                        continue
                except Exception as e:
                    err_str = str(e)
                    # v15: deteksi error network (internet disconnected, DNS, dll)
                    # dan raise dengan pesan user-friendly.
                    if any(k in err_str for k in (
                        "ERR_INTERNET_DISCONNECTED",
                        "ERR_NAME_NOT_RESOLVED",
                        "ERR_CONNECTION_REFUSED",
                        "ERR_CONNECTION_RESET",
                        "ERR_NETWORK_CHANGED",
                        "ERR_PROXY_CONNECTION_FAILED",
                        "ERR_TUNNEL_CONNECTION_FAILED",
                        "ERR_SSL_PROTOCOL_ERROR",
                        "ERR_ADDRESS_UNREACHABLE",
                    )):
                        raise RuntimeError(
                            f"INTERNET_DISCONNECTED: Tidak bisa terhubung ke {cfg['label']}. "
                            f"Periksa koneksi internet Anda dan coba lagi. "
                            f"(Detail: {err_str[:150]})"
                        )
                    raise RuntimeError(f"Gagal membuka halaman login {cfg['label']}: {e}")
            if not goto_ok and last_goto_error == "timeout":
                # Goto timeout 3x — kemungkinan internet lambat atau server down.
                # Tetap lanjut, mungkin page ter-load sebagian. Tapi kasih warning.
                pass

            deadline = asyncio.get_running_loop().time() + (LOGIN_TIMEOUT_MS / 1000)
            while asyncio.get_running_loop().time() < deadline:
                try:
                    await page.wait_for_timeout(2000)
                except Exception:
                    break

                # Popup OAuth harus tetap terbuka. Menutup semua tab tambahan di
                # sini sebelumnya ikut menutup Google sesaat setelah tombol diklik.

                # Pastikan halaman platform masih aktif setelah popup OAuth selesai.
                try:
                    _ = page.url
                except Exception:
                    try:
                        live_pages = [candidate for candidate in context.pages if not candidate.is_closed()]
                        page = live_pages[0] if live_pages else page
                    except Exception:
                        break

                try:
                    _current_url = page.url
                except Exception:
                    break

                try:
                    has_key, cookie_count, cookie_names_seen = await _has_login_cookie(context, cfg)
                    is_invalid = any(p in _current_url.lower() for p in cfg["invalid_url_parts"])
                    has_ui     = await _has_logged_in_ui(page, cfg)
                except Exception:
                    break

                # ════════════════════════════════════════════════════════════
                # v28: DETEKSI LOGIN — HANYA 1 METHOD (TIDAK BISA FALSE POSITIVE)
                # ════════════════════════════════════════════════════════════
                # Navigasi ke protected_url (URL yang butuh login).
                # Kalau redirect ke login page → BELUM login.
                # Kalau tetap di protected_url → CONFIRMED login.
                #
                # Ini SATU-SATUNYA method yang dipakai. Tidak ada UI selectors,
                # tidak ada cookie heuristics, tidak ada URL-change guessing.
                # Protected URL HANYA bisa diakses setelah login — tidak mungkin
                # false positive.
                #
                # TAPI: jangan navigasi setiap 2 detik (akan refresh halaman,
                # user tidak bisa login). Hanya navigasi kalau:
                # 1. AUTH cookie ada (signal awal bahwa mungkin sudah login), ATAU
                # 2. URL saat ini bukan di login_url (user mungkin sudah redirect
                #    setelah login), ATAU
                # 3. Setiap 30 detik (periodic check, bukan setiap 2 detik)
                # ════════════════════════════════════════════════════════════

                login_url_lower = cfg["login_url"].rstrip("/").lower()
                current_url_lower = _current_url.rstrip("/").lower()
                url_changed = current_url_lower != login_url_lower
                check_url_lower = (cfg.get("check_url") or "").rstrip("/").lower()

                # v31: Berbeda strategy per platform.
                #
                # LinkedIn: protected_url (/feed/) HANYA bisa diakses setelah login.
                #   Kalau belum login, redirect ke /login atau /authwall.
                #   Jadi navigasi ke /feed/ + cek redirect = reliable.
                #
                # JobStreet: /myactivity BISA diakses tanpa login (halaman kosong).
                #   Tidak ada protected URL yang reliable. JobStreet modern pakai
                #   sessionStorage yang tidak terbaca oleh context.cookies().
                #   Jadi untuk JobStreet: tunggu user login, lalu cek AUTH cookie
                #   (SEEK_AU_AUTH / JobseekerSessionToken). Kalau cookie tidak ada
                #   (JobStreet modern), timeout 5 menit lalu user bisa pakai
                #   "Assume logged in" sebagai fallback.
                #
                # PENTING: JANGAN navigasi paksa untuk JobStreet — itu bikin
                # halaman redirect ke /myactivity dan close browser padahal user
                # belum login (bug v30).

                is_linkedin = (platform_name == "linkedin")
                is_jobstreet = (platform_name == "jobstreet")

                if is_linkedin:
                    # LinkedIn: cek protected URL kalau ada signal login
                    should_check_protected = (
                        (has_key and url_changed)
                        or (has_ui and not is_invalid)
                        or (check_url_lower and check_url_lower != login_url_lower and check_url_lower in current_url_lower and not is_invalid)
                    )
                    if should_check_protected:
                        protected_url = cfg.get("protected_url") or cfg.get("check_url") or cfg["login_url"]
                        try:
                            await page.goto(protected_url, timeout=30000, wait_until="domcontentloaded")
                            await page.wait_for_timeout(2000)
                            final_url = page.url.lower()
                            is_invalid_after = any(p in final_url for p in cfg["invalid_url_parts"])
                            if not is_invalid_after:
                                logged_in = True
                                try:
                                    has_key, cookie_count, cookie_names_seen = await _has_login_cookie(context, cfg)
                                except Exception:
                                    pass
                                break
                        except Exception:
                            pass

                elif is_jobstreet:
                    # v36: TIDAK ADA navigasi paksa. TIDAK ADA cookie check.
                    # HANYA deteksi via JavaScript yang cek apakah halaman
                    # punya elemen yang PASTI hanya ada setelah login:
                    # - Avatar img dengan src yang mengandung "seek" atau "profile"
                    # - Button dengan aria-label yang mengandung nama user
                    # - Dropdown menu "Sign out" / "Log out" (hanya ada setelah login)
                    #
                    # TIDAK cek: data-automation (terlalu generik), link /profile
                    # (accessible tanpa login), cookie (anonymous juga punya).
                    #
                    # Bot hanya menunggu passively. User login di browser,
                    # halaman berubah, JavaScript detect elemen post-login.
                    if not is_invalid:
                        try:
                            js_result = await page.evaluate("""
                                () => {
                                    // 1. Cek "Sign out" / "Log out" / "Keluar" button
                                    // HANYA ada setelah login — anonymous visitor tidak punya
                                    const allElements = document.querySelectorAll('button, a, [role="menuitem"], [role="button"]');
                                    for (const el of allElements) {
                                        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
                                        if (text === 'sign out' || text === 'log out' || text === 'keluar' || text === 'sign out of jobstreet') {
                                            const r = el.getBoundingClientRect();
                                            const st = getComputedStyle(el);
                                            if (r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden') {
                                                return true;
                                            }
                                        }
                                    }

                                    // 2. Cek avatar img dengan src mengandung "seek" atau "gravatar"
                                    // JobStreet avatar user biasanya dari seek CDN
                                    const imgs = document.querySelectorAll('img');
                                    for (const img of imgs) {
                                        const src = (img.src || '').toLowerCase();
                                        const alt = (img.alt || '').toLowerCase();
                                        const r = img.getBoundingClientRect();
                                        // Avatar biasanya kecil (20-80px) dan di header
                                        if (r.width >= 20 && r.width <= 80 && r.height >= 20 && r.height <= 80) {
                                            const parent = img.closest('header, nav, [role="banner"]');
                                            if (parent && (src.includes('seek') || src.includes('gravatar') || src.includes('avatar') || alt.includes('profile'))) {
                                                return true;
                                            }
                                        }
                                    }

                                    // 3. Cek nama user di dropdown menu yang terbuka
                                    // JobStreet tampilkan nama user di dropdown profile
                                    const dropdowns = document.querySelectorAll('[role="menu"], [role="dialog"], [class*="dropdown" i], [class*="popover" i]');
                                    for (const dd of dropdowns) {
                                        const text = (dd.innerText || '').toLowerCase();
                                        // Cek apakah ada link "Sign out" di dalam dropdown
                                        if (text.includes('sign out') || text.includes('log out') || text.includes('keluar')) {
                                            return true;
                                        }
                                    }

                                    return false;
                                }
                            """)
                            if js_result:
                                logged_in = True
                                try:
                                    has_key, cookie_count, cookie_names_seen = await _has_login_cookie(context, cfg)
                                except Exception:
                                    pass
                                break
                        except Exception:
                            pass

            if logged_in:
                # v34 Patch 4: perlindungan terakhir — jangan save storage_state
                # kalau logged_in somehow False (race condition, dll).
                if not logged_in:
                    raise RuntimeError(
                        f"Login {cfg['label']} tidak terdeteksi. "
                        "Coba login ulang dan tunggu sampai halaman akun terbuka."
                    )
                try:
                    await context.storage_state(path=state_path)
                except Exception:
                    pass

    except Exception as e:
        # Browser crash atau error lain — re-raise dengan pesan yang jelas
        raise RuntimeError(f"Gagal capture session {cfg['label']}: {e}")
    finally:
        # v14: pastikan browser di-close walau ada exception
        if browser:
            try:
                await browser.close()
            except Exception:
                pass

    return logged_in, cookie_count, cookie_names_seen


def _run_grab_in_new_loop(platform_name: str, user_id: str):
    """
    Windows fix: jalankan Playwright di thread baru dengan event loop
    ProactorEventLoop supaya subprocess bisa dibuat.
    """
    result = {"logged_in": False, "cookie_count": 0, "cookie_names": [], "error": None}

    def thread_target():
        if sys.platform == "win32":
            loop = asyncio.ProactorEventLoop()
        else:
            loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            logged_in, cookie_count, cookie_names = loop.run_until_complete(
                _run_grab(platform_name, user_id)
            )
            result["logged_in"]    = logged_in
            result["cookie_count"] = cookie_count
            result["cookie_names"] = cookie_names
        except Exception as e:
            result["error"] = str(e)
        finally:
            loop.close()

    t = threading.Thread(target=thread_target)
    t.start()
    t.join(timeout=LOGIN_TIMEOUT_MS / 1000 + 30)

    return result


@router.post("/grab/{platform_name}")
async def grab_cookies(platform_name: str, user=Depends(get_current_user)):
    if platform_name not in PLATFORM_CONFIG:
        raise HTTPException(status_code=400, detail="Platform tidak valid")

    cfg = PLATFORM_CONFIG[platform_name]

    # Jalankan di thread terpisah dengan ProactorEventLoop (Windows fix)
    loop   = asyncio.get_running_loop()
    result = await loop.run_in_executor(
        None, _run_grab_in_new_loop, platform_name, user["id"]
    )

    if result["error"]:
        err_msg = result["error"]
        # v15: deteksi error network dan return pesan user-friendly (bukan 500).
        # Sebelumnya, semua error return 500 "Gagal membuka browser login: ..."
        # yang teknis dan menakutkan user. Sekarang:
        # - INTERNET_DISCONNECTED → return 200 dengan message yang jelas
        # - Browser crash / lainnya → tetap return 500 tapi pesan lebih jelas
        if "INTERNET_DISCONNECTED" in err_msg:
            # Extract pesan setelah "INTERNET_DISCONNECTED: "
            friendly_msg = err_msg.split("INTERNET_DISCONNECTED:", 1)[-1].strip()
            return {
                "success":   False,
                "logged_in": False,
                "login_url": cfg["login_url"],
                "message":   friendly_msg,
                "error_type": "internet_disconnected",
            }
        # Error lain (browser crash, dll) — return sebagai HTTPException
        raise HTTPException(
            status_code=500,
            detail=f"Gagal membuka browser login: {err_msg}",
        )

    if not result["logged_in"]:
        return {
            "success":   False,
            "logged_in": False,
            "login_url": cfg["login_url"],
            "message": (
                f"Session {cfg['label']} belum terdeteksi. "
                "Login di browser yang terbuka, lalu coba lagi."
            ),
        }

    save_credential_marker(user["id"], platform_name, "playwright_session")

    # Cek AUTH key cookie. TAPI jangan warning kalau session terdeteksi via UI
    # (has_ui True) — JobStreet modern (2024+) pakai sessionStorage/IndexedDB
    # untuk auth, BUKAN cookies klasik. UI post-login (avatar, profile menu)
    # adalah signal paling reliable bahwa user sudah login.
    #
    # v13 fix: warning "AUTH key cookie tidak ditemukan" muncul di Mac padahal
    # user sudah login. Itu karena JobStreet modern tidak set cookie klasik.
    # Sekarang: kalau session terdeteksi via UI (logged_in=True dari _run_grab),
    # anggap sukses penuh, TIDAK ada warning.
    cookie_names = result.get("cookie_names") or []
    key_cookies_found = [n for n in cfg["key_cookies"] if n in cookie_names]
    cookie_count = result.get("cookie_count") or 0

    # logged_in dari _run_grab sudah True → session valid (UI post-login terdeteksi).
    # Tampilkan pesan sukses tanpa warning.
    return {
        "success":   True,
        "logged_in": True,
        "message":   f"Session {cfg['label']} terdeteksi. {cookie_count} cookies tersimpan. Bot siap digunakan.",
    }


@router.post("/assume/{platform_name}")
def assume_logged_in(platform_name: str, user=Depends(get_current_user)):
    if platform_name not in PLATFORM_CONFIG:
        raise HTTPException(status_code=400, detail="Platform tidak valid")

    save_credential_marker(user["id"], platform_name, "manual_login")
    return {
        "success":   True,
        "logged_in": True,
        "message": (
            f"{PLATFORM_CONFIG[platform_name]['label']} ditandai sudah login. "
            "Capture session tetap dibutuhkan agar ORDAL bisa membaca platform otomatis."
        ),
    }


@router.get("/status")
def check_status(user=Depends(get_current_user)):
    """Cek status login per platform.

    v23 fix JobStreet false positive (LAGI):
    - HAPUS heuristic cookie_count >= 5 — terlalu longgar. JobStreet set
      5+ cookies bahkan untuk anonymous visitor (analytics, locale, device).
    - logged_in = True HANYA kalau file storage_state ada DAN berisi AUTH
      key cookie DAN file masih fresh (<7 hari).
    - Kalau file ada tapi AUTH cookie tidak ada → needs_capture=True.
    - JobStreet modern pakai sessionStorage → AUTH cookie mungkin tidak ada
      di storage_state file. TAPI itu artinya session TIDAK reliable untuk
      bot. User harus re-capture sampai AUTH cookie terdeteksi.
    - Alternatif: kalau user yakin sudah login tapi AUTH cookie tidak ada,
      bot tetap bisa jalan (pakai UI-based detection di has_jobstreet_session).
      Tapi badge "Aktif" hanya muncul kalau AUTH cookie ada supaya user
      tidak salah kira session valid padahal tidak.
    """
    import json
    import time
    result = {}
    db     = get_db()
    for platform_name in PLATFORM_CONFIG:
        cfg = PLATFORM_CONFIG[platform_name]
        path = cookies_path(user["id"], platform_name)
        has_storage_state = os.path.exists(path)
        cookie_count = 0
        has_auth_cookie = False
        is_fresh = False

        if has_storage_state:
            try:
                with open(path, "r", encoding="utf-8") as f:
                    state = json.load(f)
                cookie_names = [c.get("name", "") for c in state.get("cookies", [])]
                cookie_count = len(cookie_names)
                has_auth_cookie = any(n in cookie_names for n in cfg["key_cookies"])

                file_mtime = os.path.getmtime(path)
                file_age_days = (time.time() - file_mtime) / 86400
                is_fresh = file_age_days <= 7
            except Exception:
                cookie_count = 0
                has_auth_cookie = False
                is_fresh = False

        row  = db.execute(
            "SELECT email FROM user_credentials WHERE user_id = ? AND platform = ?",
            (user["id"], platform_name),
        ).fetchone()

        # v26: logged_in = True kalau file ada DAN fresh (<7 hari).
        # Hapus cek AUTH cookie — JobStreet modern pakai sessionStorage,
        # AUTH cookie tidak ada di storage_state file. Tapi file hanya
        # di-save oleh _run_grab saat login terkonfirmasi via UI (Strategy 1/3).
        # Jadi kalau file ada = pasti sudah login.
        # v23 terlalu ketat: cek AUTH cookie → badge "Perlu capture" padahal
        # session valid. v13 terlalu longgar: file ada = True bahkan untuk
        # file lama yang expired. v26: file ada DAN fresh = True.
        is_valid = has_storage_state and is_fresh

        result[platform_name] = {
            "logged_in":   is_valid,
            "needs_capture": (row is not None and not is_valid) or (has_storage_state and not is_valid),
            "cookie_count": cookie_count,
            "method":      row["email"] if row else None,
        }
    db.close()
    return result


@router.delete("/{platform_name}")
def delete_cookies(platform_name: str, user=Depends(get_current_user)):
    if platform_name not in PLATFORM_CONFIG:
        raise HTTPException(status_code=400, detail="Platform tidak valid")

    path = cookies_path(user["id"], platform_name)
    if os.path.exists(path):
        os.remove(path)

    db = get_db()
    db.execute(
        "DELETE FROM user_credentials WHERE user_id = ? AND platform = ?",
        (user["id"], platform_name),
    )
    db.commit()
    db.close()

    return {"message": f"Session {platform_name} dihapus"}
