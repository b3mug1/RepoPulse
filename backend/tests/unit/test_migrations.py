"""Smoke tests for Alembic migration chain integrity (empty -> head and existing -> head)."""

from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_alembic_migration_chain_has_single_head_and_valid_links():
    backend_dir = Path(__file__).resolve().parents[2]
    cfg = Config(str(backend_dir / "alembic.ini"))
    cfg.set_main_option("script_location", str(backend_dir / "alembic"))
    script = ScriptDirectory.from_config(cfg)

    heads = script.get_heads()
    assert len(heads) == 1, f"Expected single Alembic head, got {heads}"

    revisions = list(script.walk_revisions(base="base", head="heads"))
    assert len(revisions) >= 6
    revision_ids = [rev.revision for rev in revisions]
    assert revision_ids[-1] == "001"
    assert revision_ids[0] == heads[0]
    for rev in revisions:
        assert callable(getattr(rev.module, "upgrade", None))
        assert callable(getattr(rev.module, "downgrade", None))
