export const mimeTypes = ['text/html'];
export const extensions = ['html', 'htm'];
export const cmLang = 'html';

export const example =
`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Community Profiles</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px;
           margin: 2rem auto; padding: 0 1rem; line-height: 1.6; }
    h1 { color: #2c3e50; }
    .card { border: 1px solid #ddd; border-radius: 8px;
            padding: 1rem 1.5rem; margin: 1rem 0; }
    .card h2 { margin: 0 0 0.25rem; font-size: 1.1rem; }
    .card p { margin: 0.25rem 0; color: #555; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Team Directory</h1>

  <div class="card">
    <h2>Kenji Watanabe</h2>
    <p>Osaka, Japan · Engineering</p>
    <p>kenji.watanabe@example.org</p>
  </div>

  <div class="card">
    <h2>Layla Al-Hassan</h2>
    <p>Amman, Jordan · Data Science</p>
    <p>layla.alhassan@example.org</p>
  </div>

  <div class="card">
    <h2>Thien Nguyen</h2>
    <p>Ho Chi Minh City, Vietnam · Engineering</p>
    <p>thien.nguyen@example.org</p>
  </div>
</body>
</html>`;
