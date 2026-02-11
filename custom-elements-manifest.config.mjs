/**
 * Custom Elements Manifest Analyzer config for mantle-lit playground.
 * 
 * This generates a custom-elements.json that enables IDE autocomplete
 * for component properties in HTML templates.
 */

export default {
  globs: ['playground/**/*.ts'],
  exclude: ['**/*.styles.ts'],
  outdir: 'playground',
  
  /** @type {import('@custom-elements-manifest/analyzer').Plugin[]} */
  plugins: [
    // Plugin to handle View.props() + createView() pattern
    {
      name: 'mantle-lit-view-props',
      analyzePhase({ ts, node, moduleDoc }) {
        // Look for: class Foo extends View.props({ ... }) { }
        if (ts.isClassDeclaration(node) && node.name) {
          const className = node.name.text;
          const heritage = node.heritageClauses?.[0];
          
          if (heritage && heritage.types[0]) {
            const expr = heritage.types[0].expression;
            
            // Check for View.props({ ... }) pattern
            if (ts.isCallExpression(expr) && 
                ts.isPropertyAccessExpression(expr.expression) &&
                ts.isIdentifier(expr.expression.expression) &&
                expr.expression.expression.text === 'View' &&
                expr.expression.name.text === 'props') {
              
              const propsArg = expr.arguments[0];
              if (propsArg && ts.isObjectLiteralExpression(propsArg)) {
                // Extract properties from View.props({ ... })
                const classDecl = moduleDoc.declarations?.find(
                  d => d.name === className && d.kind === 'class'
                );
                
                if (classDecl) {
                  classDecl.members = classDecl.members || [];
                  
                  for (const prop of propsArg.properties) {
                    if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
                      const propName = prop.name.text;
                      let propType = 'unknown';
                      
                      // Infer type from constructor
                      if (ts.isIdentifier(prop.initializer)) {
                        const typeName = prop.initializer.text;
                        if (typeName === 'String') propType = 'string';
                        else if (typeName === 'Number') propType = 'number';
                        else if (typeName === 'Boolean') propType = 'boolean';
                        else if (typeName === 'Array') propType = 'array';
                        else if (typeName === 'Object') propType = 'object';
                        else if (typeName === 'Function') propType = 'function';
                      }
                      // Handle `as PropType<T>` - extract the type
                      else if (ts.isAsExpression(prop.initializer)) {
                        const typeNode = prop.initializer.type;
                        if (typeNode) {
                          propType = typeNode.getText();
                        }
                      }
                      
                      classDecl.members.push({
                        kind: 'field',
                        name: propName,
                        type: { text: propType },
                        attribute: propName,
                      });
                    }
                  }
                }
              }
            }
          }
        }
        
        // Look for: export const Foo = createView(FooView, { tag: 'x-foo' })
        if (ts.isVariableStatement(node) &&
            node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
          
          const declaration = node.declarationList.declarations[0];
          if (declaration?.initializer &&
              ts.isCallExpression(declaration.initializer) &&
              ts.isIdentifier(declaration.initializer.expression) &&
              declaration.initializer.expression.text === 'createView') {
            
            const args = declaration.initializer.arguments;
            if (args.length >= 2) {
              const viewClassName = args[0]?.getText();
              const optionsArg = args[1];
              
              if (ts.isObjectLiteralExpression(optionsArg)) {
                const tagProp = optionsArg.properties.find(
                  p => ts.isPropertyAssignment(p) && 
                       ts.isIdentifier(p.name) && 
                       p.name.text === 'tag'
                );
                
                if (tagProp && ts.isPropertyAssignment(tagProp) && 
                    ts.isStringLiteral(tagProp.initializer)) {
                  const tagName = tagProp.initializer.text;
                  
                  // Find the View class in the module
                  const viewClass = moduleDoc.declarations?.find(
                    d => d.name === viewClassName && d.kind === 'class'
                  );
                  
                  if (viewClass) {
                    // Mark as custom element
                    viewClass.tagName = tagName;
                    viewClass.customElement = true;
                    
                    // Add custom element definition export
                    moduleDoc.exports = moduleDoc.exports || [];
                    moduleDoc.exports.push({
                      kind: 'custom-element-definition',
                      name: tagName,
                      declaration: {
                        name: viewClassName,
                        module: moduleDoc.path,
                      },
                    });
                  }
                }
              }
            }
          }
        }
      },
    },
  ],
};
