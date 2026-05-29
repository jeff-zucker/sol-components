<#MyMenu> a **ui:Menu**; ui:label "main-menu" ;
  ui:parts ( <#MyPlainLink> <#MySubmenu> <#MyComponentItem> ) ;
  ui:style "text-align:right;" .
  
<#MyPlainLink> a **ui:Link**; ui:label "Home" ;
  **ui:href** <./data/home.html> ;
  **ui:icon** <https://fontawesome.com/icons/house?s=solid> .

<#MySubMenu> a ui:Menu; ui:label "Settings" ;
  ui:parts ( <#Light> <#Dark> );

<#MyComponentItem> a **ui:Component**;  ui:label "sample data table" ;
  **ui:name** "sol-table" ;
  **ui:attribute** [ schema:name "source" ; schema:value "./data/sample-data.ttl" ] .

<#Light> a ui:Link; ui:label "Light" ;
  ui:contents "you chose the 'Light' side)" .

<#Dark> a ui:Link; ui:label "Dark" ;
  ui:contents "you chose the 'Dark' side)" .
