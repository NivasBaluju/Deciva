"""
backend/tests/test_db_retry_fault_injection.py
-------------------------------------------------------------------------------
Fault-Injection Test Suite for Flask Backend Database Connection Retry Logic
Verifies that get_db_connection(max_retries=2) behaves correctly under transient
network failures, cloud pooler disconnections, and unrecoverable outages.
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock
import psycopg2

# Ensure project root and backend directory are in sys.path
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
for p in [PROJECT_ROOT, BACKEND_DIR]:
    if p not in sys.path:
        sys.path.insert(0, p)

from backend.services.database import get_db_connection

class TestDatabaseConnectionRetryFaultInjection(unittest.TestCase):

    @patch('time.sleep', return_value=None)
    @patch('psycopg2.connect')
    def test_transient_failure_succeeds_on_second_attempt(self, mock_connect, mock_sleep):
        """
        Fault injection scenario 1:
        Attempt 1: psycopg2.OperationalError (e.g. Neon cloud pooler closed connection)
        Attempt 2: Connection succeeds
        Expected: Function retries once with backoff and returns valid connection.
        """
        mock_conn = MagicMock()
        mock_connect.side_effect = [
            psycopg2.OperationalError("server closed the connection unexpectedly"),
            mock_conn
        ]

        conn = get_db_connection(max_retries=2)

        self.assertEqual(conn, mock_conn)
        self.assertEqual(mock_connect.call_count, 2, "Expected connect to be called twice")
        self.assertEqual(mock_sleep.call_count, 1, "Expected sleep to be invoked exactly once for backoff")
        mock_sleep.assert_called_with(0.5)

    @patch('time.sleep', return_value=None)
    @patch('psycopg2.connect')
    def test_persistent_failure_raises_cleanly_without_infinite_loop(self, mock_connect, mock_sleep):
        """
        Fault injection scenario 2:
        Attempt 1: psycopg2.OperationalError
        Attempt 2: psycopg2.OperationalError
        Expected: OperationalError is raised, exactly 2 attempts are made (no infinite loop).
        """
        mock_connect.side_effect = [
            psycopg2.OperationalError("server closed the connection unexpectedly"),
            psycopg2.OperationalError("server closed the connection unexpectedly")
        ]

        with self.assertRaises(psycopg2.OperationalError):
            get_db_connection(max_retries=2)

        self.assertEqual(mock_connect.call_count, 2, "Expected exactly max_retries attempts before raising")
        self.assertEqual(mock_sleep.call_count, 1, "Expected sleep to be called once between attempt 1 and 2")

    @patch('time.sleep', return_value=None)
    @patch('psycopg2.connect')
    def test_immediate_success_makes_single_call(self, mock_connect, mock_sleep):
        """
        Scenario 3:
        Attempt 1: Connection succeeds immediately
        Expected: Single attempt, zero sleeps, connection returned.
        """
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn

        conn = get_db_connection(max_retries=2)

        self.assertEqual(conn, mock_conn)
        self.assertEqual(mock_connect.call_count, 1, "Expected single connect call on immediate success")
        self.assertEqual(mock_sleep.call_count, 0, "No backoff sleep should occur on success")

if __name__ == '__main__':
    unittest.main()
