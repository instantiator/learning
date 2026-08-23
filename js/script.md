# Script tags

```html
<script async src="<path/to/src.js" />
```

## Delayed execution

By default, scripts block the parser while downloading and executing.

* `async` tag will download the script in parallel, and execution begins once the DOM has loaded
* `defer` is similar, but scripts will download and execute in the order they appear on the page

## Modules

### Named exports

```js
export xyz
export const xyz = 25;
export const abc = () => { /* some function */ };
```

### Default exports

```js
export default const someFunction = () => { /* some function */ };
```

### Imports

```js
import { xyz, abc } from `some-function.js`
import * as something from `some-function.js`
import theDefaultThing from `some-function.js`
```
