import { BR_COLOR } from '../content/runTree';
import { TOOLS } from '../content/tools';
import type { NoteId } from '../sim/types';

const DP = '#ff3df2';

/** What the simulation's notes say to the player, and in which color. Null means another screen handles it. */
export function noteText(id: NoteId, a?: string | number): [string, string?] | null {
  switch (id) {
    case 'tool': {
      const k = a as number;
      return [`${TOOLS[k].name} unlocked for good. Press ${k + 1} or tap its slot.`, '#2bf0ff'];
    }
    case 'firstBug':
      return ['Your first bug hatched. Open Automation (C) to hatch more.', BR_COLOR.swarm];
    case 'rigs':
      return ['Rigs unlocked. Build them from Automation (C).', BR_COLOR.prec];
    case 'trans':
      return ['Transmuter unlocked. Pick the ink it makes in Automation (C), then start it.', BR_COLOR.alch];
    case 'noRigRoom':
      return ['No room for a rig here. Clear some space first.'];
    case 'selectAllUnlocked':
      return ['Select All unlocked for good. Once a picture’s Dead Pixel is gone, Ctrl+A clears what is left.', '#2bf0ff'];
    case 'dpExposed':
      return ['The Dead Pixel is exposed! Click it before it dives back in.', DP];
    case 'dpFled':
      return ['A blast or a machine scared the Dead Pixel deeper. Only your own hand can catch it.', DP];
    case 'dpDove':
      return ['The Dead Pixel dove back into the rock.', DP];
    case 'dpCornered':
      return ['The Dead Pixel has nowhere left to hide. Click it.', DP];
    case 'turboOver':
      return ['Turbo Boot wore off.'];
    case 'restored':
      return null;
  }
}
