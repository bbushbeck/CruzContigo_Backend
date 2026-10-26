import { prisma } from '../cliente';

const personas = [
  { nombre: 'Rosa María Hernández López', fechaNacimiento: new Date('1953-04-12'), telefono: '8112345678', tipoCuidado: 'edad_avanzada' as const },
  { nombre: 'José Hernández Ruiz', fechaNacimiento: new Date('1958-09-30'), telefono: null, tipoCuidado: 'enfermedad_cronica' as const },
];

async function main() {
  for (const persona of personas) {
    await prisma.personaCuidada.create({ data: persona });
  }
  console.log(`Se crearon ${personas.length} personas ficticias.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
