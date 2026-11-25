"""Unit tests for security controls: production config, IP resolution, and input validation."""

from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.api.rate_limit import get_client_ip
from app.api.schemas import AnalyzeRequest
from app.core.config import Settings


class TestProductionConfigValidation:
    def test_rejects_placeholder_secrets_in_production(self):
        cfg = Settings(
            app_env="production",
            app_debug=False,
            app_secret_key="change-me-in-production",
            postgres_password="analyzer_secret",
            cors_origins="https://repopulse.example.com",
        )
        with pytest.raises(RuntimeError, match="APP_SECRET_KEY"):
            cfg.validate_production()

    def test_accepts_strong_production_config(self):
        cfg = Settings(
            app_env="production",
            app_debug=False,
            app_secret_key="a" * 32,
            postgres_password="strong-unique-db-password",
            cors_origins="https://repopulse.example.com",
        )
        cfg.validate_production()


class TestRateLimitClientIP:
    def test_ignores_spoofed_x_forwarded_for_from_untrusted_peer(self):
        req = SimpleNamespace(
            client=SimpleNamespace(host="198.51.100.10"),
            headers={"X-Forwarded-For": "203.0.113.50"},
        )
        assert get_client_ip(req) == "198.51.100.10"

    def test_uses_x_forwarded_for_only_from_trusted_proxy(self, monkeypatch):
        monkeypatch.setattr("app.api.rate_limit.settings.trusted_proxies", "10.0.0.1")
        req = SimpleNamespace(
            client=SimpleNamespace(host="10.0.0.1"),
            headers={"X-Forwarded-For": "203.0.113.50, 10.0.0.1"},
        )
        assert get_client_ip(req) == "203.0.113.50"


class TestOwnerRepoValidation:
    def test_rejects_traversal_and_dot_names(self):
        for bad in ("..", ".", ".hidden", "repo.", "a..b", "owner/repo"):
            with pytest.raises(ValidationError):
                AnalyzeRequest(owner=bad, name="react")

    def test_strips_dot_git_suffix(self):
        req = AnalyzeRequest(owner="facebook", name="react.git")
        assert req.name == "react"
