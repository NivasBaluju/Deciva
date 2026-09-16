"""
Fault-Injection Verification for Database Connection Retry & Resilience
Tests psycopg2.OperationalError recovery behavior:
- Case 1: Transient OperationalError on Attempt 1 -> retry backoff -> success on Attempt 2
- Case 2: Permanent OperationalError on Attempt 1 & 2 -> clean failure (OperationalError raised) -> no infinite retry
- Case 3: Live real PostgreSQL connection -> query execution verified
"""

import sys
import os
import time
from unittest.mock import patch, MagicMock

# Add project root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import psycopg2
from backend.services.database import get_db_connection, test_connection

def run_tests():
    passed = 0
    total = 3

    print("============================================================")
    print("DATABASE FAULT-INJECTION & RETRY RESILIENCE TEST SUITE")
    print("============================================================\n")

    # TEST 1: Transient failure -> retry -> success
    print("--- [TEST 1: TRANSIENT FAULT INJECTION (RETRY & RECOVER)] ---")
    mock_conn = MagicMock()
    mock_conn.autocommit = False
    attempts = []

    def mock_connect_transient(db_url, cursor_factory=None):
        attempts.append(len(attempts) + 1)
        if len(attempts) == 1:
            print("  [Fault Injection] Attempt 1: Simulating psycopg2.OperationalError('server closed the connection unexpectedly')")
            raise psycopg2.OperationalError("server closed the connection unexpectedly")
        print("  [Fault Injection] Attempt 2: Connection re-established successfully")
        return mock_conn

    start_t = time.time()
    with patch('psycopg2.connect', side_effect=mock_connect_transient):
        with patch('time.sleep', return_value=None) as mock_sleep:
            conn = get_db_connection(max_retries=2)
            assert conn == mock_conn, "Expected mock_conn returned"
            assert len(attempts) == 2, f"Expected exactly 2 attempts, got {len(attempts)}"
            assert mock_sleep.call_count == 1, f"Expected 1 backoff sleep, got {mock_sleep.call_count}"
            assert mock_sleep.call_args[0][0] == 0.5, "Expected 0.5s backoff delay"
            assert conn.autocommit is True, "Expected autocommit=True"
            print("  [PASS] Successfully caught OperationalError, applied 0.5s backoff, and recovered on Attempt 2.\n")
            passed += 1

    # TEST 2: Persistent failure -> clean failure without infinite loop
    print("--- [TEST 2: PERSISTENT FAULT INJECTION (CLEAN TERMINATION)] ---")
    persistent_attempts = []

    def mock_connect_persistent(db_url, cursor_factory=None):
        persistent_attempts.append(len(persistent_attempts) + 1)
        print(f"  [Fault Injection] Attempt {len(persistent_attempts)}: psycopg2.OperationalError('connection refused')")
        raise psycopg2.OperationalError("connection refused")

    with patch('psycopg2.connect', side_effect=mock_connect_persistent):
        with patch('time.sleep', return_value=None) as mock_sleep:
            failed_cleanly = False
            try:
                get_db_connection(max_retries=2)
            except psycopg2.OperationalError as e:
                failed_cleanly = True
                print(f"  [Verified] Caught expected psycopg2.OperationalError: {e}")
            
            assert failed_cleanly, "Expected psycopg2.OperationalError to be raised"
            assert len(persistent_attempts) == 2, f"Expected exactly 2 attempts before aborting, got {len(persistent_attempts)}"
            assert mock_sleep.call_count == 1, f"Expected exactly 1 backoff sleep before final attempt, got {mock_sleep.call_count}"
            print("  [PASS] Connection cleanly aborted after max_retries=2; no infinite loop, no unhandled exceptions.\n")
            passed += 1

    # TEST 3: Live PostgreSQL Connection & Query Execution
    print("--- [TEST 3: LIVE POSTGRESQL CONNECTION VERIFICATION] ---")
    ok, msg = test_connection()
    if ok:
        print(f"  [Verified] Live PostgreSQL connection: {msg}")
        live_conn = get_db_connection()
        cur = live_conn.cursor()
        cur.execute("SELECT 1 AS alive, current_database() AS db_name;")
        row = cur.fetchone()
        print(f"  [Verified] Query returned alive={row['alive']}, db_name={row['db_name']}")
        cur.close()
        live_conn.close()
        print("  [PASS] Live database connection and query operational.\n")
        passed += 1
    else:
        print(f"  [FAIL] Live PostgreSQL connection failed: {msg}")

    print("============================================================")
    print(f"FAULT-INJECTION RESULTS: {passed} / {total} PASS")
    print("============================================================")
    if passed == total:
        sys.exit(0)
    else:
        sys.exit(1)

if __name__ == '__main__':
    run_tests()
