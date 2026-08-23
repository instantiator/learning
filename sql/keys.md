# Keys

* Primary keys (should be irreducible - just what's needed to be unique)
* Candidate keys (potential alternate PKs)
* Super keys (exceed what's needed to be unique)
* Alternate keys (unique)
* Foreign key (constrains to a PK of another table)
* Surrogate key (stands in for...)
  * Meaning is in the context of the database
  * Still need to represent a specific thing (ie. not a row id)
* Natural key (values a person would naturally use)
  * state code
  * email address
  * NI number / SSN
  * ISBN? (is a natural key, but ISBN doesn't cover e-books...)
    * Book number - is a surrogate key if not publicised
    * It becomes a natural key if it's publicised
* Simple key (just one attribute)
* Composite key (composed of multiple attributes)
* Composite primary key (foreign key referring to this must also be composite)
* Compound key (contains at least 1 attribute that's a foreign key)
* Intelligent key (a type of natural key - made up of parts where each part has a meaning)
  * Vulnerable to changes in key system (eg. categorisation of parts)
  