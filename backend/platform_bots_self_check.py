from pathlib import Path


root = Path(__file__).parent
credentials = (root / "routers/credentials.py").read_text()
targets = (root / "routers/targets.py").read_text()
session_manager = (root / "workers/session_manager.py").read_text()
glints = (root / "workers/glints_bot.py").read_text()
indeed = (root / "workers/indeed_bot.py").read_text()

for platform in ("glints", "indeed"):
    assert f'"{platform}"' in credentials
    assert f'"{platform}"' in targets
    assert f'{platform}_targets' in session_manager
assert "https://glints.com/" in glints
assert "https://id.indeed.com/jobs" in indeed
assert "{position}" in glints and "{location}" in glints
assert "{position}" in indeed and "{location}" in indeed

print("platform bot self-check passed")
