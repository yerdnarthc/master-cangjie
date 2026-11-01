DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='mcj_app') THEN CREATE ROLE mcj_app LOGIN PASSWORD 'mcj_app_local'; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='mcj_worker') THEN CREATE ROLE mcj_worker LOGIN PASSWORD 'mcj_worker_local'; END IF;
END $$;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO mcj_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO mcj_app;
REVOKE ALL ON schema_migrations FROM mcj_app;
GRANT USAGE ON SCHEMA evaluation_exchange TO mcj_app, mcj_worker;
GRANT SELECT,INSERT,UPDATE ON evaluation_exchange.jobs TO mcj_app;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM mcj_worker;
REVOKE ALL ON evaluation_exchange.jobs FROM mcj_worker;
