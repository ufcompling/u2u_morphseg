import { initPyodide } from '../../src/services/pyodide/pyodideService.ts'

export const testSklearnCrfsuite = async () => {
    try {
        console.log('Loading Pyodide...');
        const pyodide = await initPyodide();

        console.log('Testing sklearn-crfsuite...')
        await pyodide.runPythonAsync(`
from sklearn_crfsuite import CRF

crf = CRF(algorithm='lbfgs', max_iterations=100)
X_train = [[{'word': 'sklearn'}], [{'word': 'crfsuite'}]]
y_train = [['scikit learn'], ['conditional random field suite']]
crf.fit(X_train, y_train)
predictions = crf.predict(X_train)

print(f'SUCCESS! Predictions: {predictions}')
        `);
    } catch (error) {
        console.error(error);
    }
}