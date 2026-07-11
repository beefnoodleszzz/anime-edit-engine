import { describe, expect, it } from 'vitest';
import project from '../projects/001-demo/project.json'; import { createRenderContext } from '../engine/core/RenderContext'; import { validateMasterStream } from '../engine/core/MasterValidation'; import type { ProjectManifest } from '../engine/types';
describe('Master validation', () => { const context = createRenderContext(project as ProjectManifest, 'master'); const stream = { width: 2160, height: 3840, r_frame_rate: '120/1', avg_frame_rate: '120/1', nb_read_frames: '960', duration: '8.000000' };
  it('requires strict CFR and duration-derived frame count', () => expect(validateMasterStream(stream, context, 8, 960)).toMatchObject({ expectedFrameCount: 960, isCfr: true }));
  it('rejects NTSC-like output', () => expect(() => validateMasterStream({ ...stream, avg_frame_rate: '120000/1001' }, context, 8, 960)).toThrow('strict CFR'));
});
