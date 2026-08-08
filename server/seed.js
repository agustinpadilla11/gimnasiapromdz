import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dhhfwpmxllmmatojqlao.supabase.co';
const supabaseKey = 'sb_publishable_x28NoMh8Hqbq9peQZ8UUsA_l4wbgPML';
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  console.log("Checking Supabase connection...");
  const { data, error } = await supabase.from('tournaments').select('*');
  console.log("Existing data:", data);
  if (error) console.error("Error:", error);

  console.log("Inserting dummy tournament 'pito-corto' to fix user state...");
  const dummyData = {
    id: "pito-corto",
    nombre: "Torneo Recuperado",
    modalidad: "GAF",
    adminPin: "1111",
    juezPin: "5555",
    fechaCreacion: new Date().toISOString(),
    aparatos: ['Salto', 'Paralelas', 'Viga', 'Suelo'],
    gimnastas: []
  };

  const { error: insError } = await supabase.from('tournaments').upsert([{ id: 'pito-corto', data: dummyData }]);
  if (insError) console.error("Insert error:", insError);
  else console.log("Insert successful!");
}

fix();
