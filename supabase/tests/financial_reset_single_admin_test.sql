-- Fixed single-admin variant of the complete rollback-only native fixture.
\set empty_books_single_admin true
\ir financial_reset_empty_books_test.sql
