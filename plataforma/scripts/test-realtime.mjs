/* Prueba 2: ¿funciona postgres_changes CON filter=restaurant_id=eq...? */
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'http://127.0.0.1:54321',
  'sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH',
);

const { data: auth, error } = await supabase.auth.signInWithPassword({
  email: 'admin@local.test',
  password: 'Admin12345',
});
console.log('AUTH:', error ? String(error) : auth.user?.email);
await supabase.realtime.setAuth(auth?.session?.access_token ?? null);

const { data: rest } = await supabase
  .from('restaurants').select('id').eq('slug', 'cafe-demo').single();
console.log('RESTAURANT:', rest?.id);

supabase
  .channel('test-filter-' + Math.random().toString(36).slice(2))
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${rest.id}` },
    (payload) => {
      console.log('EVENT RECEIVED (with filter):', payload.new?.order_number);
      process.exit(0);
    },
  )
  .subscribe((status, err) => console.log('STATUS:', status, err ? String(err) : ''));

setTimeout(() => { console.log('TIMEOUT — no event with filter'); process.exit(1); }, 15000);
