// Khởi tạo Supabase client cho frontend
const SUPABASE_URL = 'https://zjczsdnkmkkdykfsjzpn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqY3pzZG5rbWtrZHlrZnNqenBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk4MDgzNDIsImV4cCI6MjEwNTM4NDM0Mn0.dDGd2NgVnCBNQFGm7t5Vgo85-O_83LU3lDDPlKZ2j24';
const EDGE_FUNCTION_URL = SUPABASE_URL + '/functions/v1/api';

let supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
