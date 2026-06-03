/**
 * menu-from-rdf.js — opt-in add-on: switch on `from-rdf` for the menu family.
 *
 * Importing this module IS the activation. It is the only place in the menu
 * family (sol-tabs, sol-menu, sol-dropdown-button) that pulls in rdflib — via
 * core/menu-rdf.js → core/rdf.js. Without it, those components are declarative-
 * only (light-DOM <a> / <menu> children) and rdflib never enters their graph.
 *
 *   <script type="module" src="…/sol-tabs.js"></script>        <!-- declarative, no rdflib -->
 *   <script type="module" src="…/menu-from-rdf.js"></script>   <!-- + from-rdf, pulls rdflib -->
 *   <sol-tabs from-rdf="./tabs.ttl#Tabs"></sol-tabs>
 *
 * This layer carries no component definitions — load the components themselves
 * (individually, or via an aggregator like sol-full / sol-basic) however you
 * already do. installFromRdfLoader() wires every menu consumer that is or
 * becomes registered, in any import order (see core/menu-consumer.js).
 * sol-dropdown-button inherits the loader from SolMenu via the static prototype
 * chain.
 */
import { installFromRdfLoader } from '../core/menu-consumer.js';
import { loadMenuFromUri } from '../core/menu-rdf.js';

installFromRdfLoader(loadMenuFromUri);
