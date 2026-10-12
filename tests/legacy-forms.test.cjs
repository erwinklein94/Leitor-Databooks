const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'..','legacy-forms.js'),'utf8'),context);
context.lines=[
  'CONTROLE DE QUALIDADE DE PRODUÇÃO',
  'CORTE DE FIOS DE PROTENSÃO',
  'Lote: 00124/22   Bitola Mista',
  'Data de preparação dos moldes: 07/09/2022'
];
const production=vm.runInContext('parseProductionForm(lines,6)',context);
assert.equal(production.lote,'00124/22');
assert.equal(production.data,'07/09/2022');
assert.equal(production.tipo,'Bitola Mista');

const items=[
  {str:'CONTROLE TECNOLÓGICO DO CONCRETO',x:80,y:500},
  {str:'RASTREABILIDADE',x:150,y:480},
  ...[[507.9,'07 DIAS (MPa)'],[610.2,'14 DIAS (MPa)'],[713,'28 DIAS (MPa)']].map(([x,str])=>({str,x,y:456})),
  {str:'28 dias (≥',x:687,y:360},
  {str:'00124',x:65,y:439.5},
  {str:'07/09/2022',x:225,y:431.3},
  ...[[451,'31,0'],[494.3,'60,17'],[548.8,'6,5'],[596.4,'67,15'],[649.3,'8,02'],[698.6,'73,36'],[752,'8,13']].map(([x,str])=>({str,x,y:434.9})),
  ...[[451,'30,9'],[494.3,'60,81'],[548.8,'6,4'],[596.4,'68,82'],[649.3,'7,6'],[700.3,'75,9'],[752,'7,95']].map(([x,str])=>({str,x,y:426.6}))
];
context.items=items;
const concrete=vm.runInContext('parseConcreteForm(items,39)',context);
assert.equal(concrete.length,1);
assert.equal(concrete[0].lote,'00124');
assert.equal(concrete[0].comp['7'][0],60.17);
assert.equal(concrete[0].comp['28'][1],75.9);
assert.equal(concrete[0].trac['28'][0],8.13);
assert.equal(vm.runInContext('formMeasurement(">75,0")',context),'>75,0');
assert.equal(vm.runInContext('formMeasurement("81")',context),81);
console.log('Formulários de produção e rastreabilidade: lotes e colunas verificados.');
