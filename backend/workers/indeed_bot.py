from workers.simple_platform_bot import SimplePlatformBot


class IndeedBot(SimplePlatformBot):
    platform = "indeed"
    home_url = "https://id.indeed.com/"
    search_url = "https://id.indeed.com/jobs?q={position}&l={location}&sort=date"
    card_selectors = ("div.job_seen_beacon", "[data-testid='slider_item']", "li.css-5lfssm")
    apply_words = ("apply now", "lamar sekarang", "easily apply", "lamar")
    success_words = ("application submitted", "lamaran telah dikirim", "application has been submitted", "applied successfully")
