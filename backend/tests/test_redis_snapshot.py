import os

from services import redis_snapshot


def test_snapshot_disabled_without_redis_url(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    assert redis_snapshot.snapshot_enabled() is False
    assert redis_snapshot.fetch_snapshot() is None


def test_snapshot_key_default():
    assert "smb:" in redis_snapshot.KEY
