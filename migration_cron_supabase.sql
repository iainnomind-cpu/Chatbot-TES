-- Disparador por hora para seguimientos y alertas usando Supabase (pg_cron + pg_net).
-- Sustituye al cron de Vercel, que en plan Hobby solo corre una vez al día.
-- Ejecutar en Supabase SQL Editor. Antes, reemplaza PEGA_AQUI_EL_CRON_SECRET por el valor
-- de la variable CRON_SECRET que está en Vercel (Settings → Environment Variables).

-- 1. Extensiones (en Supabase ya vienen; esto solo las activa)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Guardar el secreto en el Vault (no queda en texto plano en el job)
select vault.create_secret('PEGA_AQUI_EL_CRON_SECRET', 'cron_secret', 'CRON_SECRET de Vercel para /api/cron/follow-up');

-- 3. Programar la llamada cada hora, al minuto 5 (hora UTC; da igual, el código respeta el horario de México)
select cron.schedule(
  'seguimientos-cada-hora',
  '5 * * * *',
  $$
  select net.http_get(
    url := 'https://erp-total-english.vercel.app/api/cron/follow-up',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);

-- ---------- Comprobaciones útiles ----------
-- Ver los jobs programados:
--   select jobid, jobname, schedule, active from cron.job;
-- Ver las últimas ejecuciones del job:
--   select start_time, status, return_message from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'seguimientos-cada-hora')
--   order by start_time desc limit 10;
-- Ver la respuesta del servidor (pg_net la guarda unas horas):
--   select created, status_code, left(content::text, 200) from net._http_response order by created desc limit 5;
-- Quitar el job si algún día pasan a Vercel Pro:
--   select cron.unschedule('seguimientos-cada-hora');
