import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const data = [
  ['GIMNASTA', 'FECHA DE NACIMIENTO', 'INSTITUCIÓN', 'CATEGORÍA', 'NIVEL'],
  ['Fernandez Mosso, Mora', '20-07-2013', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Guignet Di Marco, Allegra', '21-05-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Martin Pietrasanta, Julia', '01-04-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Vila Olguin, Martina', '02-01-2013', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Arenas, Josefina', '14-07-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Moyano Vega, Amelia', '26-12-2013', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Bernasconi Suarez, Lucia', '28-06-2013', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Videla, Maria Isabella', '06-07-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Rebaque, Sofia', '24-12-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Di Pietro, Sofia Maria', '20-08-2014', "Akro's", 'Infantil', 'Nivel 1A'],
  ['Montaña Quiroga, Ana Luz', '22-09-2013', 'Altis Espacio Deportivo', 'Infantil', 'Nivel 1A'],
  ['Romero Braña, Indira', '05-05-2014', 'Altis Espacio Deportivo', 'Infantil', 'Nivel 1A'],
  ['Amaya, Lucia', '12-03-2013', 'Corpo Libero', 'Infantil', 'Nivel 1A'],
  ['Zapata Perez, Maria Constanza', '11-11-2013', 'Jesica Buchert', 'Infantil', 'Nivel 1A'],
  ['Alvarez, Paz', '14-09-2013', 'Jesica Buchert', 'Infantil', 'Nivel 1A'],
  ['Cortez, Martina', '30-10-2013', 'Jesica Buchert', 'Infantil', 'Nivel 1A'],
  ['Jofre, Priscila', '05-12-2013', 'Jesica Buchert', 'Infantil', 'Nivel 1A'],
  ['Otero Rubio, Bianca', '03-01-2013', 'Bordano', 'Infantil', 'Nivel 1A'],
  ['Disca, Maria Isabella', '19-06-2013', 'Bordano', 'Infantil', 'Nivel 1A'],
  ['Alonso Artola, Antonio', '15-02-2013', 'Bordano', 'Infantil', 'Nivel 1A']
];

const worksheet = XLSX.utils.aoa_to_sheet(data);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Gimnastas');

const outputPath = path.join(__dirname, '..', 'gimnastas_prueba.xlsx');
XLSX.writeFile(workbook, outputPath);

console.log(`✅ Archivo Excel de prueba creado en: ${outputPath}`);
