from httpx import ASGITransport, AsyncClient

from main import app


async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/health")
    assert r.status_code == 200
    assert r.json().get("status") == "operational"


async def test_root_lists_growth_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/")
    assert r.status_code == 200
    ep = r.json().get("endpoints") or {}
    assert "credit_score" in ep
    assert "growth" in ep
