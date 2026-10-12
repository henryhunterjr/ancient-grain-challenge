"""Credential-free check of the installed Windows libpq, not a DB login test."""
from pathlib import Path
import json
import socket
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
HOST = "aws-0-us-east-1.pooler.supabase.com"
PSQL = r"C:\Program Files\PostgreSQL\17\bin\psql.exe"
OUT = ROOT / "test-output" / "libpq-tls-probe"
OUT.mkdir(parents=True, exist_ok=True)
EMPTY = OUT / "empty.pgpass"
EMPTY.write_text("", encoding="ascii")
# Construct a clean environment: never retrieve inherited passwords/services.
ENV = {"SYSTEMROOT": r"C:\Windows", "TEMP": str(OUT), "TMP": str(OUT),
       "PGPASSFILE": str(EMPTY), "PGSERVICEFILE": str(EMPTY)}
CA = (ROOT / "database/certificates/prod-ca-2021.crt").as_posix()
IP = socket.gethostbyname(HOST)

def probe(label, host, port, ca, expected):
    connection = (f"host={host} hostaddr={IP} port={port} dbname=postgres "
                  "user=postgres.pmhytaaajbhzyldmxmzb sslmode=verify-full "
                  f"sslrootcert='{ca}' sslcertmode=disable ssl_min_protocol_version=TLSv1.2 "
                  "connect_timeout=8")
    result = subprocess.run([PSQL, "-X", "-w", "-d", connection, "-c", "SELECT 1"],
                            env=ENV, stdin=subprocess.DEVNULL, capture_output=True,
                            text=True, timeout=15)
    error = result.stderr.strip()
    assert result.returncode != 0 and expected.lower() in error.lower(), (label, error)
    print(json.dumps({"check": label, "passed": True, "authenticationSucceeded": False,
                      "error": error}))

probe("system store reproduces Windows error", HOST, 5432, "system", "unregistered scheme")
probe("official CA passes TLS on owner port", HOST, 5432, CA, "no password supplied")
probe("official CA passes TLS on application port", HOST, 6543, CA, "no password supplied")
probe("incorrect hostname rejected", "incorrect.example.invalid", 5432, CA, "does not match")
if len(sys.argv) > 1:
    probe("untrusted root rejected", HOST, 5432, Path(sys.argv[1]).resolve().as_posix(),
          "certificate verify failed")
