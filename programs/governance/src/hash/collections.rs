use hashbrown::hash_map::{DefaultHashBuilder, HashMap as HBHashMap};
use std::hash::Hash;
use super::BPFBuildHasher;

/// A HashMap implementation using our BPF-compatible hasher
/// Optimized for Solana program data structures
#[derive(Debug, Clone)]
pub struct GremlinMap<K, V> {
    inner: HBHashMap<K, V, DefaultHashBuilder>,
}

impl<K, V> Default for GremlinMap<K, V>
where
    K: Eq + Hash,
{
    fn default() -> Self {
        Self::new()
    }
}

impl<K, V> GremlinMap<K, V>
where
    K: Eq + Hash,
{
    /// Creates an empty GremlinMap
    #[inline]
    pub fn new() -> Self {
        Self {
            inner: HBHashMap::with_hasher(DefaultHashBuilder::default()),
        }
    }

    /// Creates a GremlinMap with the specified capacity
    #[inline]
    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            inner: HBHashMap::with_capacity_and_hasher(capacity, DefaultHashBuilder::default()),
        }
    }

    /// Returns the number of elements in the map
    #[inline]
    pub fn len(&self) -> usize {
        self.inner.len()
    }

    /// Returns true if the map contains no elements
    #[inline]
    pub fn is_empty(&self) -> bool {
        self.inner.is_empty()
    }

    /// Clears the map, removing all elements
    #[inline]
    pub fn clear(&mut self) {
        self.inner.clear();
    }

    /// Inserts a key-value pair into the map
    #[inline]
    pub fn insert(&mut self, k: K, v: V) -> Option<V> {
        self.inner.insert(k, v)
    }

    /// Removes a key from the map, returning the value if it existed
    #[inline]
    pub fn remove(&mut self, k: &K) -> Option<V> {
        self.inner.remove(k)
    }

    /// Returns a reference to the value corresponding to the key
    #[inline]
    pub fn get(&self, k: &K) -> Option<&V> {
        self.inner.get(k)
    }

    /// Returns a mutable reference to the value corresponding to the key
    #[inline]
    pub fn get_mut(&mut self, k: &K) -> Option<&mut V> {
        self.inner.get_mut(k)
    }

    /// Returns true if the map contains the specified key
    #[inline]
    pub fn contains_key(&self, k: &K) -> bool {
        self.inner.contains_key(k)
    }

    /// Gets the given key's corresponding entry in the map for in-place manipulation
    #[inline]
    pub fn entry(&mut self, key: K) -> hashbrown::hash_map::Entry<K, V, DefaultHashBuilder> {
        self.inner.entry(key)
    }

    /// Returns an iterator over the map's entries
    #[inline]
    pub fn iter(&self) -> hashbrown::hash_map::Iter<K, V> {
        self.inner.iter()
    }

    /// Returns a mutable iterator over the map's entries
    #[inline]
    pub fn iter_mut(&mut self) -> hashbrown::hash_map::IterMut<K, V> {
        self.inner.iter_mut()
    }

    /// Returns the number of elements the map can hold without reallocating
    #[inline]
    pub fn capacity(&self) -> usize {
        self.inner.capacity()
    }

    /// Reserves capacity for at least additional more elements
    #[inline]
    pub fn reserve(&mut self, additional: usize) {
        self.inner.reserve(additional)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::pubkey::Pubkey;

    #[test]
    fn test_basic_operations() {
        let mut map = GremlinMap::new();
        let key = Pubkey::new_unique();
        let value = 42u64;

        assert!(map.is_empty());
        assert_eq!(map.len(), 0);

        map.insert(key, value);
        assert!(!map.is_empty());
        assert_eq!(map.len(), 1);
        assert_eq!(map.get(&key), Some(&value));

        map.remove(&key);
        assert!(map.is_empty());
        assert_eq!(map.get(&key), None);
    }

    #[test]
    fn test_multiple_entries() {
        let mut map = GremlinMap::with_capacity(3);
        let keys: Vec<Pubkey> = (0..3).map(|_| Pubkey::new_unique()).collect();
        
        for (i, key) in keys.iter().enumerate() {
            map.insert(*key, i as u64);
        }

        assert_eq!(map.len(), 3);
        
        for (i, key) in keys.iter().enumerate() {
            assert_eq!(map.get(key), Some(&(i as u64)));
        }
    }

    #[test]
    fn test_distribution() {
        let mut map = GremlinMap::with_capacity(1000);
        for i in 0..1000u64 {
            map.insert(Pubkey::new_unique(), i);
        }
        
        // Verify load factor is reasonable
        let capacity = map.capacity();
        let load_factor = map.len() as f64 / capacity as f64;
        assert!(load_factor < 0.9, "Load factor too high: {}", load_factor);
    }

    #[test]
    fn test_reserve_capacity() {
        let mut map = GremlinMap::new();
        let initial_capacity = map.capacity();
        
        map.reserve(100);
        assert!(map.capacity() >= initial_capacity + 100);
    }
} 