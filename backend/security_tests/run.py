"""Runs the security tests for every service, each in its own process
(every service is a package named `app`).

    python security_tests/run.py            # all services
    python security_tests/run.py sale-service

Needs a throwaway local PostgreSQL with databases authdb and shopdb
(HGV_TEST_PG, default postgresql://hgvtest@127.0.0.1:55432). See
SECURITY_TEST_PLAN.md.
"""
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SERVICES = ["auth-service", "expense-service", "product-service", "purchase-service", "report-service",
            "sale-service", "settings-service", "shop-service", "supplier-service"]

failed = []
for s in sys.argv[1:] or SERVICES:
    print(f"\n=== {s}", flush=True)
    env = {**os.environ, "HGV_SERVICE": s, "PYTHONDONTWRITEBYTECODE": "1"}
    files = ["test_service.py"] + (["test_auth.py"] if s == "auth-service" else [])
    r = subprocess.run([sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *files], cwd=HERE, env=env)
    if r.returncode not in (0, 5):
        failed.append(s)

print("\nFAILED: " + ", ".join(failed) if failed else "\nAll services passed.")
sys.exit(1 if failed else 0)
