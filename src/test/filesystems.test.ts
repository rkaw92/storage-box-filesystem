import { Filesystems, FilesystemsProxy } from '../Filesystems';
import { UserContext } from '../types/UserContext';
import * as assert from 'assert';
import { DBGateway } from '../infrastructure/DBGateway';
import { getDBGateway } from '../infrastructure/db';

const defaultUserContext: UserContext = {
  identification: { issuer: 'https://example.com', subject: 'testuser' },
  attributes: { issuer: 'https://example.com', attributes: {} },
  canCreateFilesystems: true
};

let testDBGateway: DBGateway;
function getFilesystemsAPI(userContext: UserContext = defaultUserContext): FilesystemsProxy {
  const filesystemsImplementation = new Filesystems({
    db: testDBGateway
  });
  return new FilesystemsProxy(filesystemsImplementation, userContext);
}

describe('Filesystems', function() {
  before(async function() {
    testDBGateway = getDBGateway();
  });
  
  describe('listFilesystems', function() {
    it('should return an array', async function() {
      const api = getFilesystemsAPI();
      const listOfFilesystems = await api.listFilesystems();
      assert.ok(Array.isArray(listOfFilesystems));
    });
  });
});
