# Scaffolding

## degit

```
degit <user/repo/path> <target-directory>
```

## vite

```
npm create vite@latest
```

## node

**Express** is a good library for this.

### web server with routes and logging

This gist looks handy: https://gist.github.com/kevinswiber/d59ba9df9f0d2e301014c1065e5fa2bb

### simple web server with `http`

https://www.digitalocean.com/community/tutorials/how-to-create-a-web-server-in-node-js-with-the-http-module

`http` can do routing, headers, etc.

* `req.url`
* `req.method`

```js
res.writeHead(200);
```

```js
res.setHeader("Content-Type", "application/json");
```

```js
res.setHeader("Content-Type", "text/csv");
res.setHeader("Content-Disposition", "attachment;filename=oceanpals.csv");
```

```js
const fs = require('fs').promises;
fs.readFile(__dirname + "/index.html")
  .then(contents => {
            res.setHeader("Content-Type", "text/html");
            res.writeHead(200);
            res.end(contents);
        })
```

```js
const requestListener = function (req, res) {
  res.setHeader("Content-Type", "application/json");
  switch (req.url) {
    case "/books":
      res.writeHead(200);
      res.end(books);
      break;
    case "/authors":
      res.writeHead(200);
      res.end(authors);
      break;
    default:
      res.writeHead(404);
      res.end(JSON.stringify({error:"Resource not found"}));
  }
}
```

#### body

See: https://www.digitalocean.com/community/tutorials/how-to-create-a-web-server-in-node-js-with-the-http-module#step-5-handling-post-requests-and-parsing-request-bodies

```js
let body = '';
req.on('data', chunk => body += chunk.toString());
req.on('end', () => {
  const data = JSON.parse(body); // Now body is complete
});
```