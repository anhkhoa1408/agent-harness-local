import {test,expect} from 'vitest';
import {composeInstructions} from '../../src/context/prompts';
test('explicit feature scope accompanies conflicting skill provenance',()=>{
 const text=composeInstructions({stage:'implement',hash:'fixture',adaptations:'Only approved feature checks are mandatory. Keep skipped legacy checks visible.',files:[{id:'tdd',path:'/fixture/SKILL.md',sha256:'fixture',content:'Run the entire project suite.'}]});
 expect(text).toContain('Only approved feature checks are mandatory');expect(text).toContain('Run the entire project suite');expect(text).toContain('/fixture/SKILL.md');
});
