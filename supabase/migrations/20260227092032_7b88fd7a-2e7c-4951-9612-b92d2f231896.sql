-- Create storage bucket for copilot image attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('copilot-assets', 'copilot-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to copilot-assets
CREATE POLICY "Authenticated users can upload copilot assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'copilot-assets');

-- Allow public read access for copilot assets (needed for Braze to fetch images)
CREATE POLICY "Public read access for copilot assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'copilot-assets');

-- Allow authenticated users to delete their own uploads
CREATE POLICY "Authenticated users can delete copilot assets"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'copilot-assets');