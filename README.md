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

example
-----------
    bemdeps -l blocks-desktop blocks-touch blocks-common -t js css
