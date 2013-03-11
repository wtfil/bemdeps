Converting jsdoc @deps directives to deps.js file

install
---------------
    npm install bemdeps

or

    npm install -g bemdeps


options
-----------
    -l --levels bem levels (default is "blocks-desktop and blocks-common")
    -t --tetchs bem tetchs (default is "css js bemhtml")
    -f --forse will replace original deps.js file without extending

example
-----------
````javascript
/**
 * @deps b-block1, b-block2 elem1 elem2, !b-block3 mod_val
 */
````
is equal to

````javascript
/**
 * @shouldDeps b-block1, b-block2 elem1 elem2
 * @mustDeps b-block3 mod_val
 */
````

and will convenrts into

````javascript
({
    "mustDeps": [
        {
            "block": "b-block3",
            "mods": {
                "mod": "val"
            }
        }
    ],
    "shouldDeps": [
        {
            "block": "b-block1"
        },
        {
            "block": "b-block2",
            "elems": [
                "elem1",
                "elem2"
            ]
        }
    ]
})
````

usage
-----------
    bemdeps -l blocks-desktop blocks-touch blocks-common -t js css
