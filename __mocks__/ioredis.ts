const redisMock = {
status: 'wait',
store: new Map(),
keyPrefix: '',

connect: jest.fn().mockImplementation(function() {
    this.status = 'ready';
    return Promise.resolve();
}),

quit: jest.fn().mockImplementation(function() {
    this.status = 'end'; 
    return Promise.resolve('OK');
}),

set: jest.fn().mockImplementation(function(key, value) {
    this.store.set(this.keyPrefix + key, value);
    return Promise.resolve('OK');
}),

get: jest.fn().mockImplementation(function(key) {
    return Promise.resolve(this.store.get(this.keyPrefix + key) || null);
}),

brpop: jest.fn().mockResolvedValue(null),

hset: jest.fn().mockImplementation(function(key, field, value) {
    const hashKey = this.keyPrefix + key;
    const hash = this.store.get(hashKey) || new Map();
    hash.set(field, value);
    this.store.set(hashKey, hash);
    return Promise.resolve(1);
}),

on: jest.fn(),

flushall: jest.fn().mockImplementation(function() {
    this.store.clear();
    return Promise.resolve('OK');
})
};

const MockRedis = jest.fn().mockImplementation(() => {
return Object.create(redisMock);
});

module.exports = MockRedis;
module.exports.Redis = MockRedis;
