import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://eplchawxsgxllmfhrmvo.supabase.co', 
  'sb_publishable_UJZAwjehyBPX8hI1iUvyNw_PJURg-df'
);

async function test() {
  const { data, error } = await supabase.from('device_types').select('name, ui_component').limit(1);
  if (error) {
    console.error('Error fetching device_types:', error);
  } else {
    console.log('Success device_types:', data);
  }
}
test();
