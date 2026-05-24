export const mimeTypes = ['application/ld+json'];
export const extensions = ['jsonld'];
export const cmLang = 'jsonld';

export const example = JSON.stringify({
  "@context": {
    "foaf": "http://xmlns.com/foaf/0.1/",
    "schema": "https://schema.org/",
    "name": "foaf:name",
    "knows": { "@id": "foaf:knows", "@type": "@id" },
    "jobTitle": "schema:jobTitle",
    "location": "schema:location"
  },
  "@graph": [
    {
      "@id": "http://example.org/people/catalina",
      "@type": "foaf:Person",
      "name": "Catalina Ruiz",
      "jobTitle": "UX Researcher",
      "location": "Bogotá, Colombia",
      "knows": [
        "http://example.org/people/abebe",
        "http://example.org/people/soo-jin"
      ]
    },
    {
      "@id": "http://example.org/people/abebe",
      "@type": "foaf:Person",
      "name": "Abebe Girma",
      "jobTitle": "Systems Architect",
      "location": "Addis Ababa, Ethiopia"
    },
    {
      "@id": "http://example.org/people/soo-jin",
      "@type": "foaf:Person",
      "name": "Soo-Jin Park",
      "jobTitle": "Product Manager",
      "location": "Seoul, South Korea",
      "knows": ["http://example.org/people/catalina"]
    }
  ]
}, null, 2);
