# Selectors

## Get elements

`getElementById` returns the first element with this id, or `null`

```js
document.getElementById('id');
```

`querySelector` returns the first item it finds, or `null`

```js
document.querySelector('css selectors');
```

`querySelectorAll` returns a _static_ `NodeList` - with one entry per element.

```js
document.querySelectorAll('css selectors');
```

## CSS selectors

See: https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Selectors

### Basic examples

* `div.note, div.alert` (`div`s with class `note` or with class `alert`)
* `#test` (anything with id `test`)
* `div.highlighted > p` (`p`s within a `div` with class `highlighted`)
* `iframe[data-src]` (`iframe`s with a `data-src` attribute)
* `li[data-active='1']` (`li`s with `data-active` attribute set to `1`)

