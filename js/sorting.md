# First solution

I spotted that it would be much quicker to pre-sort the list to spot unique values.

I went ahead and did the pre-sort.

Then I looked at the first and last index of the value in the sorted list - if they're the same, that's a unique value. If not, they're not.

## Sorting

Sort will be optimised because it's provided by the standard library.

Timsort - it's merge and insertion

### Other sorts

* Bubble sort: O(n) - O(n^2): repeatedly step through the list and compare/swap adjacent values
* Insertion sort: O(n) - O(n^2): insert values one at a time - could be aided by a binary search to identify the insertion point
* Selection sort: O(n^2) across the board: split the list into sorted/unsorted, take the smallest unsorted and put it into sorted
* Quick sort: O(n log n) - O(n^2): pick a pivot, and group elements by gt/lt the pivot (recursive)
* Merge sort: O(n log n) across the board: split the list in half, sort both halves, merge them together (recursive)
* Heap sort: O(n log n) across the board: convert to a Binary Heap, and moves the largest element to the end (recursive)

## Limitations

I used .indexOf and .lastIndexOf to get indices. They must perform a linear search because they can't know that the list is sorted, so that's O(n) time.

# Second solution

I then decided I could improve the solution by implementing a binary search to obtain the first and last indices. This would mean we could establish the first and last index in O(log n) time.

# Limitations

We can do better! We don't actually need the indices at all. You can just look at the previous and next values in a sorted list to determine if a value is unique. Boy do I feel like a chump!

Counterpoint - we still need to find it in the sorted list, so we need one binary search to get an index.

And then if we want to cut it out of the sorted list, we want both indices.

So maybe we keep it after all - it depends which part of the problem we want to optimise.
