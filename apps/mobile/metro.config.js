// Configuração do Metro para o monorepo (npm workspaces):
// - observa a raiz, pois @cidade-em-foco/shared e as dependências ficam fora de apps/mobile;
// - resolve primeiro apps/mobile/node_modules, garantindo uma única cópia do React
//   (a do app, 18.2.0) mesmo que outro workspace use outra versão.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
