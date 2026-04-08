-- Carpeta empresa (Google Drive): https://drive.google.com/drive/folders/1LltYcJQxBLQ13YE9vrywmBnT33NdIzwl
INSERT INTO public.app_config (key, value)
VALUES ('drive_drying_folder_id', '1LltYcJQxBLQ13YE9vrywmBnT33NdIzwl')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
