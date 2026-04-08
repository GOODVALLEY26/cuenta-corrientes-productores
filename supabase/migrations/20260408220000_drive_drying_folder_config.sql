-- Carpeta de Google Drive para listar PDFs de facturas de secado (editable en producción sin redeploy).
INSERT INTO public.app_config (key, value)
VALUES ('drive_drying_folder_id', '1LltYcJQxBLQ13YE9vrywmBnT33NdIzwl')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
