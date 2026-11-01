CREATE FUNCTION evaluation_exchange.claim_job(request_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE item evaluation_exchange.jobs;
BEGIN
 PERFORM pg_advisory_xact_lock(582042);
 IF EXISTS(SELECT FROM evaluation_exchange.jobs WHERE lease_until>now() AND outcome IS NULL) THEN RETURN NULL; END IF;
 UPDATE evaluation_exchange.jobs SET generation=generation+1, deliveries=deliveries+1, lease_until=now()+interval '90 seconds'
 WHERE id=request_id AND outcome IS NULL AND acknowledged=false AND deliveries<3 AND retry_after<=now() AND (lease_until IS NULL OR lease_until<=now()) RETURNING * INTO item;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('generation',item.generation,'payload',item.payload);
END $$;
CREATE FUNCTION evaluation_exchange.heartbeat(request_id uuid, claim integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 UPDATE evaluation_exchange.jobs SET lease_until=now()+interval '90 seconds' WHERE id=request_id AND generation=claim AND lease_until>now() AND outcome IS NULL;
 RETURN FOUND;
END $$;
CREATE FUNCTION evaluation_exchange.finish_job(request_id uuid, claim integer, evidence jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF octet_length(evidence::text)>16777216 THEN RETURN false; END IF;
 UPDATE evaluation_exchange.jobs SET outcome=evidence WHERE id=request_id AND generation=claim AND lease_until>now() AND outcome IS NULL;
 RETURN FOUND;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA evaluation_exchange FROM PUBLIC;
