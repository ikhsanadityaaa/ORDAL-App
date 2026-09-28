from workers.simple_platform_bot import SimplePlatformBot


class GlintsBot(SimplePlatformBot):
    platform = "glints"
    home_url = "https://glints.com/id/opportunities/jobs/explore"
    search_url = "https://glints.com/id/opportunities/jobs/explore?keyword={position}&locationName={location}"
    card_selectors = ("[data-testid*='job-card']", "article", "div[class*='JobCard']")
    apply_words = ("lamar", "apply")
    success_words = ("lamaran berhasil", "application submitted", "berhasil melamar", "application sent")
