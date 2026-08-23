1NF

Some basic safeties...

* Using row order not permitted  
* Mixing data types in a column not permitted  
* Table without a primary key not permitted  
* Repeating groups not permitted

2NF

Each non-key attribute must depend on the entire PK

* Deletion anomalies (bad)  
* Update anomalies (bad)  
* Insertion anomaly (bad)

`{ PK } -> { attribute }`

eg.  
`{ Player_ID } -> { Player_Rating }`  
`{ Player_ID, Item_Type } -> { Item_Quantity }`

Tables for important concepts

3NF

`Player_ID, Player_Rating, Player_Skill_Level`

There’s a transitive dependency

`{ Player_ID } -> { Player_Rating }`  
`{ Player_ID } -> { Player_Skill_Level } -> { Player_Rating }`

`Player: Player_ID, Player_Rating`  
`Player_Skill_Levels: Player_Skill_Level, Player_Rating`

Every ~~non-key~~ attribute in a table should depend on the key, the whole key, and nothing but the key.  
(Boyce-Codd Normal Form)

4NF

Multi-value dependencies

`{ Model } ->> { Color }`  
`{ Model } ->> { Style }`

Multi-value dependencies must be multi-valued dependencies on the key.

Split it out into multiple tables...

5NF

Can the table be thought of as the result of joining other tables together? If so, it’s not 5NF.  
