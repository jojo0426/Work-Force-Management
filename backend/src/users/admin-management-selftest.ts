import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function expect(label: string, condition: boolean) {
  if (!condition) throw new Error(`FAIL: ${label}`);
  console.log(`PASS: ${label}`);
}

const compact = (value: string) => value.replace(/\s+/g, '');

const usersController = readFileSync(
  resolve(__dirname, 'users.controller.ts'),
  'utf8'
);

const teamsController = readFileSync(
  resolve(__dirname, 'teams.controller.ts'),
  'utf8'
);

const users = compact(usersController);
const teams = compact(teamsController);

expect(
  'user management is administrator-only',
  users.includes('@Roles(UserRole.ADMINISTRATOR)')
);

expect(
  'user edit route exists',
  users.includes("@Patch(':id')")
);

expect(
  'password reset route exists',
  users.includes("@Patch(':id/password')")
);

expect(
  'enable-disable route remains available',
  users.includes("@Patch(':id/status')")
);

expect(
  'team transfer compares requested team with current team',
  users.includes('if(nextTeamId!==existing.teamId)')
);

expect(
  'team transfer checks unfinished technician execution',
  users.includes(
    "jobExecution.findFirst({where:{technicianId:id,completedAt:null},select:{id:true}})"
  )
);

expect(
  'active execution blocks team transfer',
  users.includes(
    'Techniciancannotbetransferredtoanotherteamwhileaworkexecutionisactive'
  )
);

expect(
  'team removal uses the same guarded transition',
  users.includes('constnextTeamId=body.teamId||null')
);

expect(
  'same-team update does not enter active-work transfer guard',
  users.includes('if(nextTeamId!==existing.teamId)')
);

expect(
  'administrator cannot disable current account',
  users.includes(
    'Administratorcannotdisablethecurrentlyauthenticatedaccount'
  )
);

expect(
  'administrator cannot remove own administrator role',
  users.includes(
    'Administratorcannotremoveadministratorrolefromthecurrentlyauthenticatedaccount'
  )
);

expect(
  'user updates remain audited',
  users.includes("action:'USER_UPDATED'")
);

expect(
  'password resets remain audited',
  users.includes("action:'USER_PASSWORD_RESET'")
);

expect(
  'team management is administrator-only',
  teams.includes('@Roles(UserRole.ADMINISTRATOR)')
);

expect(
  'team creation route exists',
  teams.includes('@Post()') &&
    teams.includes("action:'TEAM_CREATED'")
);

expect(
  'team rename route exists',
  teams.includes("@Patch(':id')") &&
    teams.includes("action:'TEAM_UPDATED'")
);

expect(
  'guarded user delete route exists',
  users.includes("@Delete(':id')") &&
    users.includes(
      'Administratorcannotdeletethecurrentlyauthenticatedaccount'
    ) &&
    users.includes(
      'Userhasoperationaloraudithistoryandcannotbepermanentlydeleted.Disabletheaccountinstead.'
    ) &&
    users.includes("action:'USER_DELETED'")
);

expect(
  'guarded team delete route exists',
  teams.includes("@Delete(':id')") &&
    teams.includes(
      'Teamstillhasusersassigned.Reassignorremovetheusersfromtheteambeforedeletingit.'
    ) &&
    teams.includes(
      'Teamhasassignmenthistoryandcannotbepermanentlydeleted.'
    ) &&
    teams.includes("action:'TEAM_DELETED'")
);

console.log('Admin management hardening regression gate passed.');