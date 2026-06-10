/**
 * <sol-bar-builder> — visual editor for a button BAR: a flat ui:Menu
 * (depth 1, no submenus) whose parts are the bar-resident plugins the user
 * wants (login, search, calendar, …). RDF-wise a bar IS a ui:Menu — where it
 * renders (e.g. a tabset's actions row) is declared by the consuming HTML,
 * never in the RDF.
 *
 *   <sol-bar-builder source="./data/tabs.ttl#Bar"></sol-bar-builder>
 *
 * Same editing model as <sol-menu-builder> (it IS the menu builder,
 * restricted to one level): name buttons, drag plugins from
 * <sol-plugins-available> onto them, reorder, save (whole-document rewrite,
 * pantry preserved).
 */

import { define } from '../core/define.js';
import { SolMenuBuilder } from './sol-menu-builder.js';

class SolBarBuilder extends SolMenuBuilder {
  static get flat() { return true; }
  static get title() { return 'Button bar'; }
}

define('sol-bar-builder', SolBarBuilder);
export { SolBarBuilder };
export default SolBarBuilder;
