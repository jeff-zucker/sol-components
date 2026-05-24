export const mimeTypes = ['text/turtle', 'text/n3'];
export const extensions = ['ttl', 'n3', 'turtle'];
export const cmLang = 'ttl';

export const example =
`@prefix : <http://example.org/people/> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix geo: <http://www.w3.org/2003/01/geo/wgs84_pos#> .
@prefix schema: <https://schema.org/> .

:amara a foaf:Person ;
    foaf:name "Amara Okafor" ;
    foaf:location "Lagos, Nigeria" ;
    foaf:knows :kenji, :layla ;
    geo:lat "6.5244" ; geo:long "3.3792" .

:kenji a foaf:Person ;
    foaf:name "Kenji Watanabe" ;
    foaf:location "Osaka, Japan" ;
    foaf:knows :priya ;
    geo:lat "34.6937" ; geo:long "135.5023" .

:priya a foaf:Person ;
    foaf:name "Priya Sharma" ;
    foaf:location "Mumbai, India" ;
    foaf:knows :layla ;
    schema:jobTitle "Software Engineer" ;
    geo:lat "19.0760" ; geo:long "72.8777" .

:layla a foaf:Person ;
    foaf:name "Layla Al-Hassan" ;
    foaf:location "Amman, Jordan" ;
    schema:jobTitle "Data Scientist" ;
    geo:lat "31.9566" ; geo:long "35.9457" .`;
