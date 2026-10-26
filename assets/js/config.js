// Public, client-side configuration for the SKARVIS site.
//
// The Supabase publishable key is meant to ship to browsers. The table it
// writes to (public.pilot_signups, see web/supabase/) only grants INSERT to
// this key, with row level security; nobody can read submissions with it.
// Submissions are read in the Supabase dashboard of the "skarvis" project.

export const CONFIG = {
  supabaseUrl: 'https://xoquclgglhucvyvirmep.supabase.co',
  supabaseKey: 'sb_publishable_hA1XFOVs8iEnNT-zFgCGZQ_6Fmor0xf',
  table: 'pilot_signups',

  // Public contact address. Empty until a SKARVIS domain mailbox exists:
  // the footer then points to the pilot form instead of an address.
  contactEmail: ''
};
