/**
 * <sol-accordion> — Accordion (collapsible sections) web component.
 *
 * Wraps child `<div>` elements into `<details>`/`<summary>` pairs.
 * Each child div should contain two inner divs: the first becomes the
 * summary (header), the second becomes the collapsible content.
 * Only one section is open at a time (exclusive mode via `<details name>`).
 *
 * The first panel opens by default. Add `start-closed` to start with
 * every panel collapsed instead.
 *
 * @element sol-accordion
 * @attr {boolean} start-closed - leave every panel collapsed on first render
 *
 * @example
 * <sol-accordion>
 *   <div><div>Section 1</div><div>Content 1</div></div>
 *   <div><div>Section 2</div><div>Content 2</div></div>
 * </sol-accordion>
 */
import { ensureDocStyle } from '../core/adopt.js';
import { CSS as ACCORDION_CSS } from './styles/sol-accordion-css.js';
import { define } from '../core/define.js';

/**
 * Accordion (collapsible sections) web component.
 *
 * Wraps child `<div>` elements into `<details>`/`<summary>` pairs.
 * Only one section is open at a time.
 *
 * @class SolAccordion
 * @extends HTMLElement
 */
class SolAccordion extends HTMLElement {
  connectedCallback() {
    const groupName = `sol-accordion-${Math.random().toString(36).slice(2, 9)}`;
    const startClosed = this.hasAttribute('start-closed');

    const authorDivs = Array.from(this.children).filter(el => el.tagName === 'DIV');

    if (!authorDivs.length) {
      this.textContent = 'No accordion panels found';
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'sol-accordion-wrapper';
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Accordion');

    authorDivs.forEach((srcDiv, i) => {
      const childDivs = Array.from(srcDiv.children).filter(el => el.tagName === 'DIV');

      const openInitial = !startClosed && i === 0;
      const det = document.createElement('details');
      det.name = groupName;
      if (openInitial) det.open = true;

      const sum = document.createElement('summary');
      sum.setAttribute('role', 'button');
      sum.setAttribute('aria-expanded', openInitial ? 'true' : 'false');
      sum.setAttribute('tabindex', '0');
      sum.id = `panel-${i}-summary`;
      
      if (childDivs.length >= 2) {
        sum.textContent = childDivs[0].textContent.trim() || `Panel ${i + 1}`;
        
        const body = document.createElement('div');
        body.className = 'accordion-body';
        body.setAttribute('role', 'region');
        body.setAttribute('aria-labelledby', `panel-${i}-summary`);
        
        for (let j = 1; j < childDivs.length; j++) {
          const contentDiv = document.createElement('div');
          contentDiv.className = 'accordion-content-section';
          const clone = childDivs[j].cloneNode(true);
          while (clone.firstChild) contentDiv.appendChild(clone.firstChild);
          body.appendChild(contentDiv);
        }
        
        det.appendChild(sum);
        det.appendChild(body);
      } else {
        sum.textContent = srcDiv.textContent.trim() || `Panel ${i + 1}`;
        const body = document.createElement('div');
        body.className = 'accordion-body';
        body.textContent = 'No content';
        det.appendChild(sum);
        det.appendChild(body);
      }

      det.addEventListener('toggle', () => {
        sum.setAttribute('aria-expanded', det.open ? 'true' : 'false');
      });

      sum.addEventListener('keypress', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          det.open = !det.open;
        }
      });

      wrapper.appendChild(det);
    });

    this.innerHTML = '';
    ensureDocStyle(this.getRootNode(), 'sol-accordion-styles', ACCORDION_CSS);
    this.appendChild(wrapper);
  }


}

define('sol-accordion', SolAccordion);
