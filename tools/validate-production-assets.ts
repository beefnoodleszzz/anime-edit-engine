import { mkdir, writeFile } from 'node:fs/promises';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { listImageAssets, validateProjectProductionAssets } from '../engine/qc/ProductionAssets';
import { loadProjectConfig, resolveProjectId } from './project-io';

const { project, timeline } = await loadProjectConfig(resolveProjectId());
ProjectLoader.validate({ project, timeline });
const allAssets = listImageAssets(project);
const productionCount = allAssets.filter((asset) => asset.usage === 'production').length;
const results = await validateProjectProductionAssets(project);
const outputRoot = `projects/${project.id}/qc`;
await mkdir(outputRoot, { recursive: true });
await writeFile(`${outputRoot}/production-assets-report.json`, `${JSON.stringify({
  projectId: project.id,
  totalRegisteredAssets: allAssets.length,
  productionAssetCount: productionCount,
  passed: true,
  assets: results,
}, null, 2)}\n`);
console.log(`Validated ${productionCount} production asset(s) for ${project.id}.`);
