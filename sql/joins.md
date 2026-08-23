# Joins

## Inner join

* Only successful matches

> eg. Which compounds contain hydrogen?

```sql
SELECT
  c.Compound_ID,
  c.Compound_Name
FROM
  Compound_Element_Details ced
INNER JOIN
  Compound c
ON
  ced.Compound_Id = c.Compound_Id
INNER JOIN
  Element e
ON
  ced.Element_Symbol = e.Element_Symbol
WHERE
  e.Element_Name = 'Hydrogen'
```

## Left outer join

* Match from Table A to Table B
  * All of Table A will be included, even if there's no match in Table B

> eg. Which elements don't belong to any compounds?

```sql
SELECT
  e.Element_Symbol,
  e.Element_Name,
  ced.Compound_ID,
  ced.Number_Of_Atoms
FROM
  Element e
LEFT OUTER JOIN
  Compound_Element_Details ced
ON
  e.Element_Symbol = ced.ElementSymbol
WHERE
  ced.Compound_ID is null
```

* This includes entries from the `Element` table that do _not_ have a match in the `Compound_Element_Details` table.

## Right outer join

A **LEFT OUTER JOIN** from A to B is the same as a **RIGHT OUTER JOIN** from B to A.

Mostly, we'd use a **LEFT OUTER JOIN**. It's slightly more intuitive to read.

## Full outer join

Finds Table A rows that don't have matches in Table B _and_ Table B rows that don't have matches in Table A.

## Join conditions

* Join conditions don't have to be equals.

> eg. Which combinations of 1 person and 1 animal have a combined age of less than 47?

```sql
SELECT
  p.Person_Name,
  a.Animal_Name,
  p.Person_Age,
  a.Animal_Age,
  p.Person_Age + a.Animal_Age as Total_Age
FROM
  Person p
INNER JOIN
  Animal a
ON
  p.Person_Age + a.Animal_Age < 47
```
## Cross join

> eg. What are all the combinations of person and animal?

```sql
SELECT
  p.Person_Name,
  a.Animal_Name
FROM
  Person p
INNER JOIN
  Animal a
ON
  1 = 1
```

* This uses a join condition that always evaluates to true to retrieve the full **cartesian product**.
* A more concise version is called a `CROSS JOIN`

```sql
SELECT
  p.Person_Name,
  a.Animal_Name
FROM
  Person p
CROSS JOIN
  Animal a
```

> eg. List all the employees and all their approvers

```sql
SELECT
  e.Employee_Number,
  e.Employee_Name,
  ap.Employee_Name as Approver_Name
FROM
  Employee e
INNER JOIN
  Employee ap
ON
  e.Approver_Employee_Number = ap.Employee_Number
```

* Shows it's possible to join a table to itself.
