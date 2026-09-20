-- Firmware Library Schema Migration

-- Create the firmwares table with all required metadata
CREATE TABLE IF NOT EXISTS public.firmwares (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    device_type_id UUID REFERENCES public.device_types(id) ON DELETE CASCADE NOT NULL,
    version TEXT NOT NULL,
    hardware_revision TEXT,
    release_channel TEXT DEFAULT 'stable' CHECK (release_channel IN ('stable', 'beta', 'alpha')),
    binary_size INTEGER NOT NULL,
    sha256 TEXT NOT NULL,
    digital_signature TEXT,
    release_notes TEXT,
    changelog TEXT,
    known_issues TEXT,
    min_supported_version TEXT,
    status TEXT DEFAULT 'Draft' CHECK (status IN ('Draft', 'Testing', 'Released', 'Deprecated', 'Archived')),
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure version and device_type_id combinations are unique
ALTER TABLE public.firmwares ADD CONSTRAINT unique_version_per_device_type UNIQUE (device_type_id, version);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_firmwares_updated_at()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_firmwares_updated_at ON public.firmwares;
CREATE TRIGGER tr_firmwares_updated_at
BEFORE UPDATE ON public.firmwares
FOR EACH ROW
EXECUTE FUNCTION update_firmwares_updated_at();

-- Enable RLS
ALTER TABLE public.firmwares ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read firmwares
CREATE POLICY "Authenticated users can read firmwares" 
ON public.firmwares FOR SELECT 
TO authenticated USING (true);

-- Allow authenticated users to insert/update firmwares (For a real production app, restrict this to admins via a roles table or JWT claim)
CREATE POLICY "Authenticated users can manage firmwares" 
ON public.firmwares FOR ALL
TO authenticated USING (true) WITH CHECK (true);
